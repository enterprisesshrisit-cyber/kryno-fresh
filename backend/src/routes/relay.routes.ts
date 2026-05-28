import type { FastifyInstance } from 'fastify';
import { authenticateAccessToken } from '../plugins/auth.js';
import { pool } from '../db/pool.js';
import { callsService, type ClientRelayCommand } from '../services/calls.service.js';
import { relayService } from '../services/relay.service.js';

export type RelayAuthMessage = {
  type: 'auth';
  accessToken: string;
};

type RelayHeartbeatMessage = {
  type: 'ping';
};

type MessageSeenCommand = {
  type: 'message_seen';
  recipientLookup: string;
  seenAt?: string;
};

async function forwardMessageSeen(auth: { userId: string; sessionId: string }, command: MessageSeenCommand) {
  const result = await pool.query<{ target_user_id: string; sender_username: string }>(
    `
      select target.id as target_user_id, sender.username as sender_username
      from users sender
      join users target on target.id::text = $2 or lower(target.username) = lower($2)
      where sender.id = $1
      limit 1
    `,
    [auth.userId, command.recipientLookup.trim()]
  );

  const row = result.rows[0];
  if (!row || row.target_user_id === auth.userId) {
    return;
  }

  relayService.sendEventToUser(row.target_user_id, {
    type: 'message_seen',
    conversationKey: row.sender_username,
    seenAt: command.seenAt ?? new Date().toISOString(),
    readerSessionId: auth.sessionId
  });
}

export function isRelayAuthMessage(value: unknown): value is RelayAuthMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<RelayAuthMessage>;
  return payload.type === 'auth' && typeof payload.accessToken === 'string' && payload.accessToken.length >= 20;
}

export async function relayRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    let auth:
      | {
          userId: string;
          sessionId: string;
          deviceId: string;
        }
      | undefined;
    let authenticated = false;
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        socket.send(
          JSON.stringify({
            type: 'relay_error',
            message: 'Realtime relay authentication timed out.'
          })
        );
        socket.close();
      }
    }, 5000);

    socket.on('close', () => {
      clearTimeout(authTimeout);
      if (auth) {
        callsService.handleSessionDisconnect(auth.sessionId);
        relayService.unregisterConnection(auth.sessionId);
      }
    });

    socket.on('error', () => {
      clearTimeout(authTimeout);
      if (auth) {
        callsService.handleSessionDisconnect(auth.sessionId);
        relayService.unregisterConnection(auth.sessionId);
      }
    });

    socket.on('message', async (raw: Buffer | string | ArrayBuffer | Buffer[]) => {
      try {
        const text = typeof raw === 'string' ? raw : raw instanceof Buffer ? raw.toString('utf8') : String(raw);
        const payload = JSON.parse(text) as RelayAuthMessage | RelayHeartbeatMessage | ClientRelayCommand;

        if (!authenticated) {
          if (!isRelayAuthMessage(payload)) {
            socket.send(
              JSON.stringify({
                type: 'relay_error',
                message: 'Realtime relay requires an authentication handshake before any commands.'
              })
            );
            socket.close();
            return;
          }

          auth = await authenticateAccessToken(payload.accessToken);
          authenticated = true;
          clearTimeout(authTimeout);
          relayService.registerConnection(auth, socket);
          await callsService.handleSessionReconnect(auth);
          socket.send(
            JSON.stringify({
              type: 'relay_ready',
              sessionId: auth.sessionId,
              userId: auth.userId
            })
          );
          return;
        }

        const command = payload as ClientRelayCommand | MessageSeenCommand;
        if (!auth) {
          socket.send(
            JSON.stringify({
              type: 'relay_error',
              message: 'Realtime relay session is missing authentication context.'
            })
          );
          socket.close();
          return;
        }
        if ((payload as RelayHeartbeatMessage).type === 'ping') {
          socket.send(
            JSON.stringify({
              type: 'pong'
            })
          );
          return;
        }
        if ((payload as unknown as MessageSeenCommand).type === 'message_seen') {
          const seenCommand = payload as unknown as MessageSeenCommand;
          if (typeof seenCommand.recipientLookup === 'string' && seenCommand.recipientLookup.trim().length >= 3) {
            await forwardMessageSeen(auth, seenCommand);
          }
          return;
        }
        await callsService.handleCommand(auth, command as ClientRelayCommand);
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: 'relay_error',
            message: error instanceof Error ? error.message : 'Invalid relay command.'
          })
        );
      }
    });
  });
}

import type { FastifyInstance } from 'fastify';
import { authenticateAccessToken } from '../plugins/auth.js';
import { callsService, type ClientRelayCommand } from '../services/calls.service.js';
import { relayService } from '../services/relay.service.js';

export type RelayAuthMessage = {
  type: 'auth';
  accessToken: string;
};

type RelayHeartbeatMessage = {
  type: 'ping';
};

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
          callsService.handleSessionReconnect(auth.sessionId);
          relayService.registerConnection(auth, socket);
          socket.send(
            JSON.stringify({
              type: 'relay_ready',
              sessionId: auth.sessionId,
              userId: auth.userId
            })
          );
          return;
        }

        const command = payload as ClientRelayCommand;
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
        await callsService.handleCommand(auth, command);
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

type RelayAuthContext = {
  userId: string;
  sessionId: string;
  deviceId: string;
};

type RelaySocket = {
  send(data: string): void;
  close(): void;
  readyState: number;
  on(event: string, listener: (...args: unknown[]) => void): void;
};

type DirectRelayMessage = {
  messageId: string;
  senderUserId: string;
  senderDeviceSessionId: string;
  recipientDeviceSessionId: string | null;
  messageType: string;
  ciphertext: string;
  encryptedContentType: string;
  clientCreatedAt: string;
  serverReceivedAt: string;
  expiresAt: string | null;
};

type RelayConnection = RelayAuthContext & {
  socket: RelaySocket;
};

export class RelayService {
  private connectionsBySession = new Map<string, RelayConnection>();
  private sessionsByUser = new Map<string, Set<string>>();

  listUserSessionIds(userId: string) {
    return Array.from(this.sessionsByUser.get(userId) ?? []);
  }

  sendEventToSession(sessionId: string, payload: unknown) {
    const connection = this.connectionsBySession.get(sessionId);
    if (!connection) {
      return false;
    }

    try {
      connection.socket.send(JSON.stringify(payload));
      return true;
    } catch {
      this.unregisterConnection(sessionId);
      return false;
    }
  }

  sendEventToUser(userId: string, payload: unknown) {
    const sessionIds = this.sessionsByUser.get(userId);
    if (!sessionIds) {
      return {
        delivered: false,
        deliveredCount: 0
      };
    }

    let deliveredCount = 0;
    for (const sessionId of sessionIds) {
      if (this.sendEventToSession(sessionId, payload)) {
        deliveredCount += 1;
      }
    }

    return {
      delivered: deliveredCount > 0,
      deliveredCount
    };
  }

  registerConnection(auth: RelayAuthContext, socket: RelaySocket) {
    this.unregisterConnection(auth.sessionId);

    const connection: RelayConnection = {
      ...auth,
      socket
    };

    this.connectionsBySession.set(auth.sessionId, connection);

    const userSessions = this.sessionsByUser.get(auth.userId) ?? new Set<string>();
    userSessions.add(auth.sessionId);
    this.sessionsByUser.set(auth.userId, userSessions);
  }

  unregisterConnection(sessionId: string) {
    const existing = this.connectionsBySession.get(sessionId);
    if (!existing) {
      return;
    }

    this.connectionsBySession.delete(sessionId);
    const userSessions = this.sessionsByUser.get(existing.userId);
    if (!userSessions) {
      return;
    }

    userSessions.delete(sessionId);
    if (userSessions.size === 0) {
      this.sessionsByUser.delete(existing.userId);
    }
  }

  deliverDirectMessage(target: {
    recipientUserId: string;
    recipientDeviceSessionId?: string | null;
    payload: DirectRelayMessage;
  }) {
    const targets: RelayConnection[] = [];

    if (target.recipientDeviceSessionId) {
      const connection = this.connectionsBySession.get(target.recipientDeviceSessionId);
      if (connection?.userId === target.recipientUserId) {
        targets.push(connection);
      }
    } else {
      const sessionIds = this.sessionsByUser.get(target.recipientUserId);
      if (sessionIds) {
        for (const sessionId of sessionIds) {
          const connection = this.connectionsBySession.get(sessionId);
          if (connection) {
            targets.push(connection);
          }
        }
      }
    }

    if (targets.length === 0) {
      return {
        delivered: false,
        deliveredCount: 0,
        deliveredSessionIds: [] as string[]
      };
    }

    const envelope = {
      type: 'direct_message',
      message: target.payload
    };

    const deliveredSessionIds: string[] = [];

    for (const connection of targets) {
      if (this.sendEventToSession(connection.sessionId, envelope)) {
        deliveredSessionIds.push(connection.sessionId);
      }
    }

    return {
      delivered: deliveredSessionIds.length > 0,
      deliveredCount: deliveredSessionIds.length,
      deliveredSessionIds
    };
  }
}

export const relayService = new RelayService();

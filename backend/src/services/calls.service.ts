import { randomUUID } from 'node:crypto';
import { AccessToken } from 'livekit-server-sdk';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { pushService } from './push.service.js';
import { relayService } from './relay.service.js';

const CALL_RING_TIMEOUT_MS = 60_000;
const CALL_RECONNECT_GRACE_MS = 75_000;
const LIVEKIT_TOKEN_TTL_SECONDS = 15 * 60;

export type CallMode = 'audio' | 'video';

type RelayAuthContext = {
  userId: string;
  sessionId: string;
};

type LiveKitTokenInput = {
  mode: CallMode;
  roomName?: string | null;
  recipientLookup?: string | null;
};

type CallInviteCommand = {
  type: 'call_invite';
  callId: string;
  recipientLookup: string;
  mode: CallMode;
  mediaProvider?: 'livekit' | 'webrtc';
  roomName?: string;
};

type CallAcceptCommand = {
  type: 'call_accept';
  callId: string;
};

type CallRejectCommand = {
  type: 'call_reject';
  callId: string;
  reason?: string;
};

type CallEndCommand = {
  type: 'call_end';
  callId: string;
  reason?: string;
};

type CallSignalCommand = {
  type: 'call_signal';
  callId: string;
  targetSessionId: string;
  signal: {
    type: 'offer' | 'answer' | 'ice-candidate';
    sdp?: string;
    candidate?: {
      candidate: string;
      sdpMid?: string | null;
      sdpMLineIndex?: number | null;
      usernameFragment?: string | null;
    };
  };
};

export type ClientRelayCommand =
  | CallInviteCommand
  | CallAcceptCommand
  | CallRejectCommand
  | CallEndCommand
  | CallSignalCommand;

type ActiveCall = {
  callId: string;
  mode: CallMode;
  callerUserId: string;
  callerSessionId: string;
  recipientUserId: string;
  recipientUsername: string;
  mediaProvider: 'livekit' | 'webrtc';
  roomName: string | null;
  invitedSessionIds: Set<string>;
  acceptedSessionId: string | null;
  state: 'ringing' | 'connecting' | 'connected';
  timeout: NodeJS.Timeout;
};

function normalizeReason(reason?: string) {
  return reason?.trim() || 'ended';
}

function normalizeLiveKitRoomName(value?: string) {
  const roomName = value?.trim();
  if (!roomName) {
    return null;
  }

  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(roomName)) {
    return null;
  }

  return roomName;
}

export class CallsService {
  private callsById = new Map<string, ActiveCall>();
  private callIdsBySession = new Map<string, Set<string>>();
  private disconnectTimersBySession = new Map<string, NodeJS.Timeout>();

  private attachSession(callId: string, sessionId: string) {
    const bucket = this.callIdsBySession.get(sessionId) ?? new Set<string>();
    bucket.add(callId);
    this.callIdsBySession.set(sessionId, bucket);
  }

  private detachSession(callId: string, sessionId: string) {
    const bucket = this.callIdsBySession.get(sessionId);
    if (!bucket) {
      return;
    }

    bucket.delete(callId);
    if (bucket.size === 0) {
      this.callIdsBySession.delete(sessionId);
    }
  }

  private clearCall(call: ActiveCall) {
    clearTimeout(call.timeout);
    this.callsById.delete(call.callId);
    this.detachSession(call.callId, call.callerSessionId);

    for (const sessionId of call.invitedSessionIds) {
      this.detachSession(call.callId, sessionId);
    }

    if (call.acceptedSessionId) {
      this.detachSession(call.callId, call.acceptedSessionId);
    }
  }

  private clearDisconnectTimer(sessionId: string) {
    const timer = this.disconnectTimersBySession.get(sessionId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.disconnectTimersBySession.delete(sessionId);
  }

  private sendEnded(call: ActiveCall, targetSessionId: string, reason: string, endedBySessionId?: string | null) {
    relayService.sendEventToSession(targetSessionId, {
      type: 'call_ended',
      callId: call.callId,
      reason,
      endedBySessionId: endedBySessionId ?? null
    });
  }

  private endCall(call: ActiveCall, reason: string, endedBySessionId?: string | null) {
    const participants = new Set<string>([call.callerSessionId, ...call.invitedSessionIds]);
    if (call.acceptedSessionId) {
      participants.add(call.acceptedSessionId);
    }

    for (const sessionId of participants) {
      this.sendEnded(call, sessionId, reason, endedBySessionId);
    }

    this.clearCall(call);
  }

  private sessionIsBusy(sessionId: string) {
    const callIds = this.callIdsBySession.get(sessionId);
    if (!callIds || callIds.size === 0) {
      return false;
    }

    for (const callId of callIds) {
      const call = this.callsById.get(callId);
      if (call) {
        return true;
      }
    }

    return false;
  }

  private async resolveRecipient(lookup: string) {
    const result = await pool.query<{ id: string; username: string }>(
      `
        select id, username
        from users
        where id::text = $1 or lower(username) = lower($1)
        limit 1
      `,
      [lookup]
    );

    return result.rows[0] ?? null;
  }

  private async resolveUsername(userId: string) {
    const result = await pool.query<{ username: string }>(
      `
        select username
        from users
        where id = $1
        limit 1
      `,
      [userId]
    );

    return result.rows[0]?.username ?? 'Unknown';
  }

  private requireLiveKitConfig() {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new AppError(503, 'Managed call service is not configured yet.', 'LIVEKIT_NOT_CONFIGURED');
    }

    return {
      url: env.LIVEKIT_URL,
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET
    };
  }

  async createLiveKitToken(auth: RelayAuthContext, input: LiveKitTokenInput) {
    const liveKit = this.requireLiveKitConfig();
    const callerUsername = await this.resolveUsername(auth.userId);
    const roomName = input.roomName?.trim() || `kryno-${input.mode}-${randomUUID()}`;
    const participantIdentity = `${auth.userId}:${auth.sessionId}`;
    let recipient: { id: string; username: string } | null = null;

    if (input.recipientLookup?.trim()) {
      recipient = await this.resolveRecipient(input.recipientLookup);

      if (!recipient) {
        throw new AppError(404, 'Recipient not found.', 'RECIPIENT_NOT_FOUND');
      }

      if (recipient.id === auth.userId) {
        throw new AppError(400, 'You cannot call your own account.', 'SELF_CALL_NOT_ALLOWED');
      }
    }

    const token = new AccessToken(liveKit.apiKey, liveKit.apiSecret, {
      identity: participantIdentity,
      name: callerUsername,
      ttl: LIVEKIT_TOKEN_TTL_SECONDS,
      metadata: JSON.stringify({
        userId: auth.userId,
        sessionId: auth.sessionId,
        mode: input.mode
      })
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: true
    });

    return {
      provider: 'livekit' as const,
      url: liveKit.url,
      token: await token.toJwt(),
      roomName,
      mode: input.mode,
      participantIdentity,
      participantName: callerUsername,
      recipientUserId: recipient?.id ?? null,
      recipientUsername: recipient?.username ?? null,
      expiresInSeconds: LIVEKIT_TOKEN_TTL_SECONDS,
      e2eeRequired: false
    };
  }

  async handleCommand(auth: RelayAuthContext, command: ClientRelayCommand) {
    switch (command.type) {
      case 'call_invite':
        return this.startCall(auth, command);
      case 'call_accept':
        return this.acceptCall(auth, command);
      case 'call_reject':
        return this.rejectCall(auth, command);
      case 'call_end':
        return this.finishCall(auth, command);
      case 'call_signal':
        return this.forwardSignal(auth, command);
      default:
        return undefined;
    }
  }

  async handleSessionReconnect(auth: RelayAuthContext) {
    this.clearDisconnectTimer(auth.sessionId);

    for (const call of this.callsById.values()) {
      if (
        call.recipientUserId !== auth.userId ||
        call.acceptedSessionId ||
        call.state !== 'ringing' ||
        call.invitedSessionIds.has(auth.sessionId) ||
        this.sessionIsBusy(auth.sessionId)
      ) {
        continue;
      }

      call.invitedSessionIds.add(auth.sessionId);
      this.attachSession(call.callId, auth.sessionId);

      const callerUsername = await this.resolveUsername(call.callerUserId);
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_invite',
        callId: call.callId,
        mode: call.mode,
        callerSessionId: call.callerSessionId,
        callerUserId: call.callerUserId,
        callerUsername,
        mediaProvider: call.mediaProvider,
        roomName: call.roomName
      });
    }
  }

  private async startCall(auth: RelayAuthContext, command: CallInviteCommand) {
    const recipient = await this.resolveRecipient(command.recipientLookup);
    const callerUsername = await this.resolveUsername(auth.userId);
    const mediaProvider = command.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
    const roomName = mediaProvider === 'livekit' ? normalizeLiveKitRoomName(command.roomName) : null;

    if (mediaProvider === 'livekit' && !roomName) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'Managed call room is invalid.'
      });
      return;
    }

    if (!recipient) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'Recipient not found.'
      });
      return;
    }

    if (recipient.id === auth.userId) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'You cannot call your own account.'
      });
      return;
    }

    const connectedSessionIds = relayService.listUserSessionIds(recipient.id);
    const invitedSessionIds = connectedSessionIds.filter((sessionId) => !this.sessionIsBusy(sessionId));

    if (connectedSessionIds.length > 0 && invitedSessionIds.length === 0) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'Recipient is already in another call.'
      });
      return;
    }

    const timeout = setTimeout(() => {
      const call = this.callsById.get(command.callId);
      if (!call || call.acceptedSessionId) {
        return;
      }

      this.endCall(call, 'missed', null);
    }, CALL_RING_TIMEOUT_MS);

    const call: ActiveCall = {
      callId: command.callId,
      mode: command.mode,
      callerUserId: auth.userId,
      callerSessionId: auth.sessionId,
      recipientUserId: recipient.id,
      recipientUsername: recipient.username,
      mediaProvider,
      roomName,
      invitedSessionIds: new Set(invitedSessionIds),
      acceptedSessionId: null,
      state: 'ringing',
      timeout
    };

    this.callsById.set(call.callId, call);
    this.attachSession(call.callId, auth.sessionId);

    const pushResult = await pushService.sendCallInviteNotification({
      recipientUserId: recipient.id,
      callerUsername,
      callId: call.callId,
      mode: call.mode
    });

    for (const sessionId of invitedSessionIds) {
      this.attachSession(call.callId, sessionId);
      relayService.sendEventToSession(sessionId, {
        type: 'call_invite',
        callId: call.callId,
        mode: call.mode,
        callerSessionId: auth.sessionId,
        callerUserId: auth.userId,
        callerUsername,
        mediaProvider: call.mediaProvider,
        roomName: call.roomName
      });
    }

    relayService.sendEventToSession(auth.sessionId, {
      type: 'call_ringing',
      callId: call.callId,
      recipientUserId: recipient.id,
      recipientUsername: recipient.username,
      mode: call.mode,
      mediaProvider: call.mediaProvider,
      roomName: call.roomName,
      pushNotification: pushResult,
      waitingForAppOpen: invitedSessionIds.length === 0
    });
  }

  private acceptCall(auth: RelayAuthContext, command: CallAcceptCommand) {
    const call = this.callsById.get(command.callId);
    if (!call) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_ended',
        callId: command.callId,
        reason: 'expired',
        endedBySessionId: null
      });
      return;
    }

    if (!call.invitedSessionIds.has(auth.sessionId) || call.recipientUserId !== auth.userId) {
      return;
    }

    if (call.acceptedSessionId && call.acceptedSessionId !== auth.sessionId) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_ended',
        callId: call.callId,
        reason: 'answered_elsewhere',
        endedBySessionId: call.acceptedSessionId
      });
      return;
    }

    clearTimeout(call.timeout);
    call.acceptedSessionId = auth.sessionId;
    call.state = 'connecting';
    this.attachSession(call.callId, auth.sessionId);

    for (const invitedSessionId of call.invitedSessionIds) {
      if (invitedSessionId !== auth.sessionId) {
        this.sendEnded(call, invitedSessionId, 'answered_elsewhere', auth.sessionId);
        this.detachSession(call.callId, invitedSessionId);
      }
    }

    call.invitedSessionIds = new Set([auth.sessionId]);

    relayService.sendEventToSession(call.callerSessionId, {
      type: 'call_accepted',
      callId: call.callId,
      peerSessionId: auth.sessionId,
      mediaProvider: call.mediaProvider,
      roomName: call.roomName
    });

    relayService.sendEventToSession(auth.sessionId, {
      type: 'call_join',
      callId: call.callId,
      peerSessionId: call.callerSessionId,
      mediaProvider: call.mediaProvider,
      roomName: call.roomName
    });
  }

  private rejectCall(auth: RelayAuthContext, command: CallRejectCommand) {
    const call = this.callsById.get(command.callId);
    if (!call) {
      return;
    }

    const reason = normalizeReason(command.reason || 'declined');

    if (call.callerSessionId === auth.sessionId) {
      this.endCall(call, 'cancelled', auth.sessionId);
      return;
    }

    if (call.recipientUserId !== auth.userId || !call.invitedSessionIds.has(auth.sessionId)) {
      return;
    }

    relayService.sendEventToSession(call.callerSessionId, {
      type: 'call_rejected',
      callId: call.callId,
      reason,
      bySessionId: auth.sessionId
    });

    this.endCall(call, reason, auth.sessionId);
  }

  private finishCall(auth: RelayAuthContext, command: CallEndCommand) {
    const call = this.callsById.get(command.callId);
    if (!call) {
      return;
    }

    const participantSessionIds = new Set<string>([call.callerSessionId, ...call.invitedSessionIds]);
    if (call.acceptedSessionId) {
      participantSessionIds.add(call.acceptedSessionId);
    }

    if (!participantSessionIds.has(auth.sessionId)) {
      return;
    }

    this.endCall(call, normalizeReason(command.reason), auth.sessionId);
  }

  private forwardSignal(auth: RelayAuthContext, command: CallSignalCommand) {
    const call = this.callsById.get(command.callId);
    if (!call) {
      return;
    }

    const allowedSessionIds = new Set<string>([call.callerSessionId]);
    if (call.acceptedSessionId) {
      allowedSessionIds.add(call.acceptedSessionId);
    }

    if (!allowedSessionIds.has(auth.sessionId) || !allowedSessionIds.has(command.targetSessionId)) {
      return;
    }

    relayService.sendEventToSession(command.targetSessionId, {
      type: 'call_signal',
      callId: call.callId,
      fromSessionId: auth.sessionId,
      signal: command.signal
    });
  }

  handleSessionDisconnect(sessionId: string) {
    this.clearDisconnectTimer(sessionId);

    const timer = setTimeout(() => {
      this.disconnectTimersBySession.delete(sessionId);

      const callIds = Array.from(this.callIdsBySession.get(sessionId) ?? []);

      for (const callId of callIds) {
        const call = this.callsById.get(callId);
        if (!call) {
          continue;
        }

        if (call.callerSessionId === sessionId) {
          this.endCall(call, 'caller_disconnected', sessionId);
          continue;
        }

        if (call.acceptedSessionId === sessionId) {
          this.endCall(call, 'peer_disconnected', sessionId);
          continue;
        }

        if (call.invitedSessionIds.has(sessionId)) {
          call.invitedSessionIds.delete(sessionId);
          this.detachSession(call.callId, sessionId);

          if (call.invitedSessionIds.size === 0 && !call.acceptedSessionId) {
            this.endCall(call, 'unavailable', sessionId);
          }
        }
      }
    }, CALL_RECONNECT_GRACE_MS);

    this.disconnectTimersBySession.set(sessionId, timer);
  }
}

export const callsService = new CallsService();

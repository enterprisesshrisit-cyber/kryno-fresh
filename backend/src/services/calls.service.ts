import { AccessToken } from 'livekit-server-sdk';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { captureException } from './observability.service.js';
import { pushService } from './push.service.js';
import { relayService } from './relay.service.js';

const CALL_RING_TIMEOUT_MS = 60_000;
const CALL_RECONNECT_GRACE_MS = 75_000;
const LIVEKIT_TOKEN_TTL_SECONDS = 15 * 60;
const CALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallMode = 'audio' | 'video';

type RelayAuthContext = {
  userId: string;
  sessionId: string;
};

type LiveKitTokenInput = {
  callId: string;
};

type PersistedLiveKitCall = {
  call_id: string;
  mode: CallMode;
  caller_user_id: string;
  caller_device_session_id: string;
  recipient_user_id: string;
  accepted_device_session_id: string | null;
  media_provider: 'livekit' | 'webrtc';
  room_name: string | null;
  state: string;
  expires_at: string | Date;
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

type CallConnectedCommand = {
  type: 'call_connected';
  callId: string;
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
  | CallConnectedCommand
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
  expiresAt: Date;
  invitedSessionIds: Set<string>;
  acceptedSessionId: string | null;
  state: 'ringing' | 'connecting' | 'connected';
  timeout: NodeJS.Timeout;
};

type PersistedCallState =
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'missed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'unavailable'
  | 'failed';

function logCallEvent(event: string, details: Record<string, unknown>) {
  console.log('[KrynoCalls]', event, details);
}

async function trySendCallPush(input: {
  recipientUserId: string;
  callerUsername: string;
  callId: string;
  mode: 'audio' | 'video';
}) {
  try {
    return await pushService.sendCallInviteNotification(input);
  } catch (error) {
    captureException(error, {
      surface: 'CallsService',
      reason: 'call_push_notification_failed'
    });
    return { attempted: 0, sent: 0, failed: true };
  }
}

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

  private broadcastEnded(call: ActiveCall, reason: string, endedBySessionId?: string | null) {
    this.sendEndedPush(call.recipientUserId, call.callId, reason);
    const participants = new Set<string>([call.callerSessionId, ...call.invitedSessionIds]);
    if (call.acceptedSessionId) {
      participants.add(call.acceptedSessionId);
    }

    for (const sessionId of participants) {
      this.sendEnded(call, sessionId, reason, endedBySessionId);
    }
  }

  private sendEndedPush(recipientUserId: string, callId: string, reason: string, excludeSessionIds?: string[]) {
    void pushService.sendCallEndedNotification({ recipientUserId, callId, reason, excludeSessionIds }).catch((error) => {
      captureException(error, { surface: 'CallsService', reason: 'call_cancel_push_failed', callId });
    });
  }

  private async handleRingTimeout(callId: string) {
    const call = this.callsById.get(callId);
    if (!call || call.acceptedSessionId) {
      return;
    }

    try {
      const expired = await pool.query<{ call_id: string }>(
        `
          update call_sessions
          set
            state = 'missed',
            ended_at = now(),
            end_reason = 'missed',
            updated_at = now()
          where call_id = $1
            and state = 'ringing'
            and accepted_device_session_id is null
            and expires_at <= now()
          returning call_id
        `,
        [callId]
      );

      if (expired.rows[0]) {
        logCallEvent('ring_timeout', {
          callId,
          state: call.state
        });
        this.broadcastEnded(call, 'missed', null);
        this.clearCall(call);
        return;
      }

      const persisted = await pool.query<{
        state: string;
        accepted_device_session_id: string | null;
        expires_at: string | Date;
      }>(
        `
          select state, accepted_device_session_id, expires_at
          from call_sessions
          where call_id = $1
          limit 1
        `,
        [callId]
      );
      const row = persisted.rows[0];

      if (!row || row.state !== 'ringing' || row.accepted_device_session_id) {
        this.clearCall(call);
        return;
      }

      const remainingMs = new Date(row.expires_at).getTime() - Date.now();
      call.timeout = setTimeout(
        () => void this.handleRingTimeout(callId),
        Math.max(250, remainingMs + 50)
      );
    } catch (error) {
      captureException(error, {
        surface: 'CallsService',
        reason: 'call_ring_timeout_check_failed',
        callId
      });

      const activeCall = this.callsById.get(callId);
      if (activeCall && !activeCall.acceptedSessionId) {
        activeCall.timeout = setTimeout(() => void this.handleRingTimeout(callId), 2_000);
      }
    }
  }

  private async persistCallStart(call: ActiveCall) {
    try {
      const result = await pool.query<{ call_id: string }>(
        `
          insert into call_sessions (
            call_id,
            mode,
            caller_user_id,
            caller_device_session_id,
            recipient_user_id,
            media_provider,
            room_name,
            state,
            started_at,
            expires_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, 'ringing', now(), $8, now())
          on conflict (call_id) do nothing
          returning call_id
        `,
        [
          call.callId,
          call.mode,
          call.callerUserId,
          call.callerSessionId,
          call.recipientUserId,
          call.mediaProvider,
          call.roomName,
          call.expiresAt
        ]
      );
      if (!result.rows[0]) {
        throw new AppError(409, 'Call identifier is already in use.', 'CALL_ID_CONFLICT');
      }
    } catch (error) {
      captureException(error, {
        surface: 'CallsService',
        reason: 'call_state_insert_failed',
        callId: call.callId
      });
      throw error instanceof AppError
        ? error
        : new AppError(503, 'Call service is temporarily unavailable.', 'CALL_STATE_UNAVAILABLE');
    }
  }

  private async persistCallState(
    call: ActiveCall,
    state: PersistedCallState,
    options: {
      acceptedSessionId?: string | null;
      endReason?: string | null;
    } = {}
  ) {
    try {
      const result = await pool.query(
        `
          update call_sessions
          set
            state = $2,
            accepted_device_session_id = coalesce($3::uuid, accepted_device_session_id),
            accepted_at = case when $2 in ('connecting', 'connected') and accepted_at is null then now() else accepted_at end,
            connected_at = case when $2 = 'connected' and connected_at is null then now() else connected_at end,
            ended_at = case when $2 in ('ended', 'missed', 'declined', 'cancelled', 'expired', 'unavailable', 'failed') then now() else ended_at end,
            end_reason = coalesce($4, end_reason),
            expires_at = case when $2 in ('connecting', 'connected') then greatest(expires_at, now() + interval '4 hours') else expires_at end,
            updated_at = now()
          where call_id = $1
        `,
        [call.callId, state, options.acceptedSessionId ?? null, options.endReason ?? null]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      captureException(error, {
        surface: 'CallsService',
        reason: 'call_state_update_failed',
        callId: call.callId,
        state
      });
      return false;
    }
  }

  private endCall(call: ActiveCall, reason: string, endedBySessionId?: string | null) {
    const persistedState: PersistedCallState =
      reason === 'missed' ||
      reason === 'declined' ||
      reason === 'cancelled' ||
      reason === 'expired' ||
      reason === 'unavailable'
        ? reason
        : 'ended';
    logCallEvent('end', {
      callId: call.callId,
      state: call.state,
      reason,
      endedBySessionId: endedBySessionId ?? null
    });
    void this.persistCallState(call, persistedState, {
      endReason: reason
    });

    this.broadcastEnded(call, reason, endedBySessionId);
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

  private async getCallRestrictionReason(callerUserId: string, recipientUserId: string) {
    const result = await pool.query<{
      blocked: boolean;
      message_visibility: string;
      caller_follows_recipient: boolean;
    }>(
      `
        select
          exists(
            select 1
            from blocked_users
            where (blocker_user_id = $1 and blocked_user_id = $2)
               or (blocker_user_id = $2 and blocked_user_id = $1)
          ) as blocked,
          coalesce(up.message_visibility, 'public') as message_visibility,
          exists(
            select 1
            from follows f
            where f.follower_user_id = $1
              and f.followee_user_id = $2
          ) as caller_follows_recipient
        from users u
        left join user_profiles up on up.user_id = u.id
        where u.id = $2
        limit 1
      `,
      [callerUserId, recipientUserId]
    );

    const row = result.rows[0];
    if (row?.blocked) {
      return 'You cannot call this account.';
    }
    if (
      row &&
      (row.message_visibility === 'none' ||
        (row.message_visibility === 'followers' && !row.caller_follows_recipient))
    ) {
      return 'This user is not accepting calls right now.';
    }
    return null;
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

  private notifyLiveKitAccepted(
    auth: RelayAuthContext,
    call: PersistedLiveKitCall,
    newlyAccepted: boolean
  ) {
    if (!newlyAccepted) {
      return;
    }
    this.sendEndedPush(call.recipient_user_id, call.call_id, 'answered_elsewhere', [auth.sessionId]);

    const activeCall = this.callsById.get(call.call_id);
    if (activeCall) {
      clearTimeout(activeCall.timeout);
      activeCall.acceptedSessionId = auth.sessionId;
      activeCall.state = 'connecting';
      this.attachSession(activeCall.callId, auth.sessionId);

      for (const invitedSessionId of activeCall.invitedSessionIds) {
        if (invitedSessionId !== auth.sessionId) {
          this.sendEnded(activeCall, invitedSessionId, 'answered_elsewhere', auth.sessionId);
          this.detachSession(activeCall.callId, invitedSessionId);
        }
      }

      activeCall.invitedSessionIds = new Set([auth.sessionId]);
    } else {
      for (const sessionId of relayService.listUserSessionIds(call.recipient_user_id)) {
        if (sessionId !== auth.sessionId) {
          relayService.sendEventToSession(sessionId, {
            type: 'call_ended',
            callId: call.call_id,
            reason: 'answered_elsewhere',
            endedBySessionId: auth.sessionId
          });
        }
      }
    }

    logCallEvent('accepted', {
      callId: call.call_id,
      callerSessionId: call.caller_device_session_id,
      acceptedSessionId: auth.sessionId,
      mediaProvider: call.media_provider,
      roomName: call.room_name
    });

    relayService.sendEventToSession(call.caller_device_session_id, {
      type: 'call_accepted',
      callId: call.call_id,
      peerSessionId: auth.sessionId,
      mediaProvider: call.media_provider,
      roomName: call.room_name
    });

    relayService.sendEventToSession(auth.sessionId, {
      type: 'call_join',
      callId: call.call_id,
      peerSessionId: call.caller_device_session_id,
      mediaProvider: call.media_provider,
      roomName: call.room_name
    });
  }

  private async persistLiveKitAcceptance(auth: RelayAuthContext, input: LiveKitTokenInput) {
    if (!CALL_ID_PATTERN.test(input.callId)) {
      throw new AppError(400, 'Call request is invalid.', 'INVALID_CALL_ID');
    }

    const accepted = await pool.query<PersistedLiveKitCall>(
      `
        update call_sessions
        set
          state = 'connecting',
          accepted_device_session_id = $3,
          accepted_at = coalesce(accepted_at, now()),
          expires_at = greatest(expires_at, now() + interval '4 hours'),
          updated_at = now()
        where call_id = $1
          and recipient_user_id = $2
          and media_provider = 'livekit'
          and state = 'ringing'
          and accepted_device_session_id is null
          and expires_at > now()
        returning
          call_id,
          mode,
          caller_user_id,
          caller_device_session_id,
          recipient_user_id,
          accepted_device_session_id,
          media_provider,
          room_name,
          state,
          expires_at
      `,
      [input.callId, auth.userId, auth.sessionId]
    );

    let call = accepted.rows[0];
    const newlyAccepted = Boolean(call);
    if (!call) {
      const existing = await pool.query<PersistedLiveKitCall>(
        `
          select
            call_id,
            mode,
            caller_user_id,
            caller_device_session_id,
            recipient_user_id,
            accepted_device_session_id,
            media_provider,
            room_name,
            state,
            expires_at
          from call_sessions
          where call_id = $1
          limit 1
        `,
        [input.callId]
      );
      call = existing.rows[0];
    }

    if (!call) {
      throw new AppError(404, 'Call is no longer available.', 'CALL_NOT_FOUND');
    }
    if (call.recipient_user_id !== auth.userId) {
      throw new AppError(403, 'You are not the recipient of this call.', 'CALL_ACCESS_DENIED');
    }
    if (call.media_provider !== 'livekit') {
      throw new AppError(409, 'This call does not use managed media.', 'CALL_PROVIDER_MISMATCH');
    }
    if (new Date(call.expires_at).getTime() <= Date.now()) {
      throw new AppError(410, 'This call has expired.', 'CALL_EXPIRED');
    }
    if (
      call.accepted_device_session_id &&
      call.accepted_device_session_id !== auth.sessionId
    ) {
      throw new AppError(409, 'This call was answered on another device.', 'CALL_ANSWERED_ELSEWHERE');
    }
    if (
      call.accepted_device_session_id !== auth.sessionId ||
      !['connecting', 'connected'].includes(call.state)
    ) {
      throw new AppError(409, 'Call is no longer available to answer.', 'CALL_ENDED');
    }

    this.notifyLiveKitAccepted(auth, call, newlyAccepted);
    return call;
  }

  async acceptLiveKitCall(auth: RelayAuthContext, input: LiveKitTokenInput) {
    await this.persistLiveKitAcceptance(auth, input);
    return this.createLiveKitToken(auth, input);
  }

  async endLiveKitCall(auth: RelayAuthContext, input: LiveKitTokenInput & { reason: 'ended' | 'declined' | 'cancelled' }) {
    // Recheck ownership/device binding atomically against another device accepting.
    const result = await pool.query<PersistedLiveKitCall>(`
      update call_sessions set state = $4, end_reason = $4, ended_at = now(), updated_at = now()
      where call_id = $1 and state in ('ringing', 'connecting', 'connected')
        and ((caller_user_id = $2 and caller_device_session_id = $3)
          or (recipient_user_id = $2 and (accepted_device_session_id = $3
            or (accepted_device_session_id is null and state = 'ringing'))))
      returning *
    `, [input.callId, auth.userId, auth.sessionId, input.reason]);
    const call = result.rows[0];
    if (!call) {
      const existing = await pool.query<PersistedLiveKitCall>('select * from call_sessions where call_id = $1', [input.callId]);
      const row = existing.rows[0];
      if (!row || (row.caller_user_id !== auth.userId && row.recipient_user_id !== auth.userId)) {
        throw new AppError(404, 'Call not found.', 'CALL_NOT_FOUND');
      }
      if (['ringing', 'connecting', 'connected'].includes(row.state)) {
        throw new AppError(403, 'This call is active on another device.', 'CALL_DEVICE_MISMATCH');
      }
      return { ended: true };
    }
    const active = this.callsById.get(input.callId);
    if (active) {
      this.broadcastEnded(active, input.reason, auth.sessionId);
      this.clearCall(active);
    } else {
      for (const sessionId of new Set([call.caller_device_session_id, ...relayService.listUserSessionIds(call.recipient_user_id)])) {
        relayService.sendEventToSession(sessionId, { type: 'call_ended', callId: input.callId, reason: input.reason, endedBySessionId: auth.sessionId });
      }
      this.sendEndedPush(call.recipient_user_id, input.callId, input.reason);
    }
    return { ended: true };
  }

  async createLiveKitToken(auth: RelayAuthContext, input: LiveKitTokenInput) {
    const liveKit = this.requireLiveKitConfig();
    const callResult = await pool.query<{
      call_id: string;
      mode: CallMode;
      caller_user_id: string;
      caller_device_session_id: string;
      recipient_user_id: string;
      accepted_device_session_id: string | null;
      room_name: string | null;
      state: string;
      expires_at: string;
    }>(
      `
        select
          call_id,
          mode,
          caller_user_id,
          caller_device_session_id,
          recipient_user_id,
          accepted_device_session_id,
          room_name,
          state,
          expires_at
        from call_sessions
        where call_id = $1
        limit 1
      `,
      [input.callId]
    );
    const call = callResult.rows[0];
    if (!call || new Date(call.expires_at).getTime() <= Date.now()) {
      throw new AppError(404, 'Call is no longer available.', 'CALL_NOT_FOUND');
    }
    if (!['ringing', 'connecting', 'connected'].includes(call.state)) {
      throw new AppError(409, 'Call has already ended.', 'CALL_ENDED');
    }

    const isCaller = call.caller_user_id === auth.userId;
    const isRecipient = call.recipient_user_id === auth.userId;
    if (!isCaller && !isRecipient) {
      throw new AppError(403, 'You are not a participant in this call.', 'CALL_ACCESS_DENIED');
    }
    if (isCaller && call.caller_device_session_id !== auth.sessionId) {
      throw new AppError(403, 'This call belongs to another device.', 'CALL_DEVICE_MISMATCH');
    }
    if (isCaller && call.state === 'ringing') {
      throw new AppError(409, 'Waiting for the recipient to answer.', 'CALL_NOT_ACCEPTED');
    }
    if (isRecipient && (call.accepted_device_session_id !== auth.sessionId ||
        !['connecting', 'connected'].includes(call.state))) {
      throw new AppError(403, 'Accept this call on this device before joining.', 'CALL_NOT_ACCEPTED');
    }

    const roomName = normalizeLiveKitRoomName(call.room_name ?? undefined);
    if (!roomName) {
      throw new AppError(503, 'Managed call room is unavailable.', 'CALL_ROOM_UNAVAILABLE');
    }

    const participantName = await this.resolveUsername(auth.userId);
    const participantIdentity = `${auth.userId}:${auth.sessionId}`;

    logCallEvent('livekit_token_requested', {
      callId: call.call_id,
      userId: auth.userId,
      sessionId: auth.sessionId,
      mode: call.mode,
      roomName
    });

    const token = new AccessToken(liveKit.apiKey, liveKit.apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: LIVEKIT_TOKEN_TTL_SECONDS,
      metadata: JSON.stringify({
        callId: call.call_id,
        userId: auth.userId,
        sessionId: auth.sessionId,
        mode: call.mode
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
      mode: call.mode,
      participantIdentity,
      participantName,
      recipientUserId: call.recipient_user_id,
      recipientUsername: null,
      expiresInSeconds: LIVEKIT_TOKEN_TTL_SECONDS,
      e2eeRequired: true
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
      case 'call_connected':
        return this.markCallConnected(auth, command);
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
    if (!CALL_ID_PATTERN.test(command.callId) ||
        !['audio', 'video'].includes(command.mode) ||
        typeof command.recipientLookup !== 'string' ||
        command.recipientLookup.trim().length < 3) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'Call request is invalid.'
      });
      return;
    }
    if (this.callsById.has(command.callId) || this.sessionIsBusy(auth.sessionId)) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'You are already in another call.'
      });
      return;
    }

    const mediaProvider = command.mediaProvider === 'livekit' ? 'livekit' : 'webrtc';
    if (mediaProvider === 'livekit') {
      try {
        this.requireLiveKitConfig();
      } catch {
        relayService.sendEventToSession(auth.sessionId, {
          type: 'call_unavailable',
          callId: command.callId,
          reason: 'Calling is temporarily unavailable.'
        });
        return;
      }
    }

    const recipient = await this.resolveRecipient(command.recipientLookup);
    const callerUsername = await this.resolveUsername(auth.userId);
    const roomName = mediaProvider === 'livekit' ? `kryno-${command.mode}-${command.callId}` : null;
    logCallEvent('invite_received', {
      callId: command.callId,
      callerUserId: auth.userId,
      callerSessionId: auth.sessionId,
      recipientLookup: command.recipientLookup,
      mode: command.mode,
      mediaProvider,
      roomName
    });

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

    const restrictionReason = await this.getCallRestrictionReason(auth.userId, recipient.id);
    if (restrictionReason) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: restrictionReason
      });
      return;
    }

    const connectedSessionIds = relayService.listUserSessionIds(recipient.id);
    const invitedSessionIds = connectedSessionIds.filter((sessionId) => !this.sessionIsBusy(sessionId));
    logCallEvent('recipient_sessions_resolved', {
      callId: command.callId,
      recipientUserId: recipient.id,
      connectedSessionCount: connectedSessionIds.length,
      invitedSessionCount: invitedSessionIds.length
    });

    if (connectedSessionIds.length > 0 && invitedSessionIds.length === 0) {
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: 'Recipient is already in another call.'
      });
      return;
    }

    const expiresAt = new Date(Date.now() + CALL_RING_TIMEOUT_MS);
    const timeout = setTimeout(
      () => void this.handleRingTimeout(command.callId),
      CALL_RING_TIMEOUT_MS
    );

    const call: ActiveCall = {
      callId: command.callId,
      mode: command.mode,
      callerUserId: auth.userId,
      callerSessionId: auth.sessionId,
      recipientUserId: recipient.id,
      recipientUsername: recipient.username,
      mediaProvider,
      roomName,
      expiresAt,
      invitedSessionIds: new Set(invitedSessionIds),
      acceptedSessionId: null,
      state: 'ringing',
      timeout
    };

    try {
      await this.persistCallStart(call);
    } catch (error) {
      clearTimeout(timeout);
      relayService.sendEventToSession(auth.sessionId, {
        type: 'call_unavailable',
        callId: command.callId,
        reason: error instanceof AppError ? error.message : 'Call service is temporarily unavailable.'
      });
      return;
    }

    this.callsById.set(call.callId, call);
    this.attachSession(call.callId, auth.sessionId);

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
      waitingForAppOpen: invitedSessionIds.length === 0
    });

    void trySendCallPush({
      recipientUserId: recipient.id,
      callerUsername,
      callId: call.callId,
      mode: call.mode
    }).then((pushResult) => {
      logCallEvent('invite_push_result', {
        callId: call.callId,
        attempted: pushResult.attempted,
        sent: pushResult.sent,
        failed: 'failed' in pushResult ? pushResult.failed : false
      });
    });
  }

  private async acceptCall(auth: RelayAuthContext, command: CallAcceptCommand) {
    logCallEvent('accept_received', {
      callId: command.callId,
      userId: auth.userId,
      sessionId: auth.sessionId
    });
    const call = this.callsById.get(command.callId);
    if (!call || call.mediaProvider === 'livekit') {
      try {
        await this.persistLiveKitAcceptance(auth, { callId: command.callId });
      } catch (error) {
        logCallEvent('accept_failed', {
          callId: command.callId,
          userId: auth.userId,
          sessionId: auth.sessionId,
          code: error instanceof AppError ? error.code : 'UNKNOWN'
        });
        relayService.sendEventToSession(auth.sessionId, {
          type: 'call_ended',
          callId: command.callId,
          reason: error instanceof AppError ? error.code.toLowerCase() : 'failed',
          endedBySessionId: null
        });
      }
      return;
    }

    if (!call.invitedSessionIds.has(auth.sessionId) || call.recipientUserId !== auth.userId) {
      logCallEvent('accept_ignored_invalid_session', {
        callId: command.callId,
        userId: auth.userId,
        sessionId: auth.sessionId
      });
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
    const persisted = await this.persistCallState(call, 'connecting', {
      acceptedSessionId: auth.sessionId
    });
    if (!persisted) {
      this.endCall(call, 'failed', auth.sessionId);
      return;
    }
    call.acceptedSessionId = auth.sessionId;
    call.state = 'connecting';
    this.attachSession(call.callId, auth.sessionId);
    logCallEvent('accepted', {
      callId: call.callId,
      callerSessionId: call.callerSessionId,
      acceptedSessionId: auth.sessionId,
      mediaProvider: call.mediaProvider,
      roomName: call.roomName
    });

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

  private async markCallConnected(auth: RelayAuthContext, command: CallConnectedCommand) {
    const call = this.callsById.get(command.callId);
    if (!call) {
      logCallEvent('connected_ignored_missing_call', {
        callId: command.callId,
        userId: auth.userId,
        sessionId: auth.sessionId
      });
      return;
    }

    const participantSessionIds = new Set<string>([call.callerSessionId]);
    if (call.acceptedSessionId) {
      participantSessionIds.add(call.acceptedSessionId);
    }

    if (!participantSessionIds.has(auth.sessionId)) {
      logCallEvent('connected_ignored_invalid_session', {
        callId: call.callId,
        userId: auth.userId,
        sessionId: auth.sessionId
      });
      return;
    }

    call.state = 'connected';
    await this.persistCallState(call, 'connected');
    logCallEvent('connected', {
      callId: call.callId,
      sessionId: auth.sessionId,
      mediaProvider: call.mediaProvider,
      roomName: call.roomName
    });
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

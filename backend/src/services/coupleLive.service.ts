import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { requireCouple } from './couples.service.js';
import { relayService } from './relay.service.js';

type Auth = { userId: string; sessionId: string };
type LiveSession = {
  id: string; couple_id: string; feature: 'screen' | 'typing'; owner_user_id: string;
  viewer_user_id: string; owner_device_id: string | null; viewer_device_id: string | null;
  status: 'requested' | 'active' | 'ended'; ended_reason: string | null;
  expires_at: string; owner_seen_at: string | null; viewer_seen_at: string | null;
  last_billed_at: string; last_sequence: string;
};
export const dailyAllowance = (feature: 'screen' | 'typing') => feature === 'screen'
  ? env.SCREEN_SHARE_FREE_SECONDS_PER_DAY : env.LIVE_TYPING_FREE_SECONDS_PER_DAY;

function rtcAdmin() {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new AppError(503, 'Screen sharing is temporarily unavailable.', 'SCREEN_SERVICE_UNAVAILABLE');
  }
  return new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws/, 'http'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

async function authorize(client: Pick<PoolClient, 'query'>, auth: Auth, id: string) {
  const result = await client.query<LiveSession>('select * from couple_live_sessions where id = $1', [id]);
  let session = result.rows[0];
  if (!session || ![session.owner_user_id, session.viewer_user_id].includes(auth.userId)) {
    throw new AppError(403, 'This sharing session is not available.', 'LIVE_ACCESS_DENIED');
  }
  // Relationship before session is the common lock order for revoke/unlink/relay.
  if (session.status !== 'ended') await requireCouple(client, auth.userId, session.couple_id);
  session = (await client.query<LiveSession>('select * from couple_live_sessions where id = $1 for update', [id])).rows[0];
  if (!session) throw new AppError(403, 'This sharing session is not available.', 'LIVE_ACCESS_DENIED');
  const owner = session.owner_user_id === auth.userId;
  const device = owner ? session.owner_device_id : session.viewer_device_id;
  if (device && device !== auth.sessionId) throw new AppError(403, 'Use the device that started this session.', 'LIVE_DEVICE_MISMATCH');
  if (session.status === 'ended') return session;
  const permission = await client.query<{ allowed: boolean }>(`
    select case when $3 = 'screen' then trusted_screen else live_typing end as allowed
    from couple_permissions where couple_id = $1 and owner_user_id = $2`, [session.couple_id, session.owner_user_id, session.feature]);
  const devices = await client.query('select id from device_sessions where id = $1 and user_id = $2 and trusted = true', [auth.sessionId, auth.userId]);
  if (!permission.rows[0]?.allowed || !devices.rows.length || new Date(session.expires_at).getTime() <= Date.now()) {
    throw new AppError(403, 'Sharing permission expired or was revoked.', 'LIVE_PERMISSION_REVOKED');
  }
  return session;
}

export class CoupleLiveService {
  async permissions(userId: string) {
    const pair = await requireCouple(pool, userId);
    const result = await pool.query(`select owner_user_id as "ownerId", trusted_screen as "trustedScreen",
      live_typing as "liveTyping", screen_requests as "screenRequests", updated_at as "updatedAt"
      from couple_permissions where couple_id = $1`, [pair.id]);
    return { coupleId: pair.id, permissions: result.rows };
  }

  async updatePermission(userId: string, input: { trustedScreen?: boolean; liveTyping?: boolean; screenRequests?: boolean }) {
    const ended = await withTransaction(async (client) => {
      const pair = await requireCouple(client, userId);
      await client.query(`update couple_permissions set trusted_screen = coalesce($3, trusted_screen),
        live_typing = coalesce($4, live_typing), screen_requests = coalesce($5, screen_requests), updated_at = now()
        where couple_id = $1 and owner_user_id = $2`, [pair.id, userId, input.trustedScreen ?? null, input.liveTyping ?? null, input.screenRequests ?? null]);
      const result = await client.query<{ id: string }>(`update couple_live_sessions set status = 'ended', ended_reason = 'permission_revoked'
        where couple_id = $1 and owner_user_id = $2 and status <> 'ended'
        and ((feature = 'screen' and $3::boolean = false) or (feature = 'typing' and $4::boolean = false)) returning id`, [pair.id, userId, input.trustedScreen ?? null, input.liveTyping ?? null]);
      return result.rows;
    });
    for (const session of ended) await this.closeRoom(session.id);
    return this.permissions(userId);
  }

  async usage(userId: string) {
    const result = await pool.query<{ feature: string; seconds_used: number }>("select feature, seconds_used from couple_feature_usage where user_id = $1 and usage_date = (now() at time zone 'UTC')::date", [userId]);
    return { resetTimezone: 'UTC', freeTestingRelease: true, purchasesAvailable: false, allowances: (['screen', 'typing'] as const).map((feature) => ({
      feature, remainingSeconds: Math.max(0, dailyAllowance(feature) - (result.rows.find((row) => row.feature === feature)?.seconds_used ?? 0))
    })) };
  }

  async create(auth: Auth, feature: 'screen' | 'typing') {
    if (feature === 'screen') rtcAdmin();
    return withTransaction(async (client) => {
      const pair = await requireCouple(client, auth.userId);
      const ownerId = feature === 'screen' ? pair.partnerId : auth.userId;
      const viewerId = feature === 'screen' ? auth.userId : pair.partnerId;
      const permission = await client.query<{ allowed: boolean }>(`select case when $3 = 'screen' then trusted_screen else live_typing end as allowed
        from couple_permissions where couple_id = $1 and owner_user_id = $2 for update`, [pair.id, ownerId, feature]);
      if (!permission.rows[0]?.allowed) throw new AppError(403, 'Your partner has not enabled this sharing permission.', 'LIVE_PERMISSION_REQUIRED');
      await client.query('select id from users where id = $1 for update', [ownerId]);
      await client.query("update couple_live_sessions set status = 'ended', ended_reason = 'expired' where owner_user_id = $1 and expires_at <= now() and status <> 'ended'", [ownerId]);
      const active = await client.query<LiveSession>("select * from couple_live_sessions where owner_user_id = $1 and feature = $2 and status <> 'ended'", [ownerId, feature]);
      if (active.rows.length) {
        const current = active.rows[0];
        const bound = feature === 'screen' ? current.viewer_device_id : current.owner_device_id;
        if (bound !== auth.sessionId) throw new AppError(409, 'Sharing is already active on another device.', 'LIVE_ALREADY_ACTIVE');
        return current;
      }
      const usage = await client.query<{ seconds_used: number }>("select seconds_used from couple_feature_usage where user_id = $1 and feature = $2 and usage_date = (now() at time zone 'UTC')::date", [ownerId, feature]);
      if ((usage.rows[0]?.seconds_used ?? 0) >= dailyAllowance(feature)) throw new AppError(409, "Today's sharing allowance has finished.", 'LIVE_LIMIT_REACHED');
      const viewerDevice = feature === 'screen' ? auth.sessionId : (await client.query<{ id: string }>(
        'select id from device_sessions where user_id = $1 and trusted = true order by last_seen_at desc limit 1', [viewerId])).rows[0]?.id;
      if (!viewerDevice) throw new AppError(409, 'Your partner has no available device.', 'LIVE_DEVICE_UNAVAILABLE');
      const result = await client.query<LiveSession>(`insert into couple_live_sessions(couple_id, feature, owner_user_id, viewer_user_id, owner_device_id, viewer_device_id)
        values ($1, $2, $3, $4, $5, $6) returning *`, [pair.id, feature, ownerId, viewerId, feature === 'typing' ? auth.sessionId : null, viewerDevice]);
      return result.rows[0];
    });
  }

  async list(auth: Auth) {
    const pair = await requireCouple(pool, auth.userId);
    const result = await pool.query<LiveSession>("select * from couple_live_sessions where couple_id = $1 and status <> 'ended' and expires_at > now() order by created_at desc", [pair.id]);
    return { sessions: result.rows };
  }

  async get(auth: Auth, id: string) { return withTransaction((client) => authorize(client, auth, id)); }

  async heartbeat(auth: Auth, id: string) {
    const current = await this.get(auth, id);
    let actuallyLive = current.feature === 'typing' && current.status === 'active';
    if (current.feature === 'screen' && current.status === 'active') {
      let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>> = [];
      try { participants = await rtcAdmin().listParticipants(`couple-screen-${id}`); }
      catch (error) {
        if ((error as { code?: string }).code !== 'not_found') throw error;
      }
      actuallyLive = participants.some((peer) => peer.identity === `${current.viewer_user_id}:${current.viewer_device_id}`)
        && participants.some((peer) => peer.identity === `${current.owner_user_id}:${current.owner_device_id}` && peer.tracks.some((track) => track.source === TrackSource.SCREEN_SHARE));
    }
    const result = await withTransaction(async (client) => {
      const session = await authorize(client, auth, id);
      if (session.status === 'ended') return { session, remainingSeconds: 0 };
      await client.query('select id from users where id = $1 for update', [session.owner_user_id]);
      const stamp = await client.query<{ now: string; usage_date: string }>("select now() as now, (now() at time zone 'UTC')::date::text as usage_date");
      const now = new Date(stamp.rows[0].now).getTime();
      const day = stamp.rows[0].usage_date;
      const fresh = session.owner_seen_at && session.viewer_seen_at
        && now - new Date(session.owner_seen_at).getTime() < 12_000
        && now - new Date(session.viewer_seen_at).getTime() < 12_000;
      // Bound billing to server-observed heartbeat freshness, never client elapsed time.
      const midnight = Date.parse(`${day}T00:00:00Z`);
      const billingStart = Math.max(midnight, new Date(session.last_billed_at).getTime());
      const seconds = actuallyLive && fresh ? Math.max(0, Math.min(10, Math.floor((now - billingStart) / 1000))) : 0;
      const billedThrough = actuallyLive && fresh ? new Date(billingStart + seconds * 1000).toISOString() : stamp.rows[0].now;
      const usage = await client.query<{ seconds_used: number }>(`insert into couple_feature_usage(user_id, feature, usage_date, seconds_used)
        values ($1, $2, $3::date, $4) on conflict (user_id, feature, usage_date)
        do update set seconds_used = couple_feature_usage.seconds_used + excluded.seconds_used returning seconds_used`, [session.owner_user_id, session.feature, day, seconds]);
      const remainingSeconds = Math.max(0, dailyAllowance(session.feature) - usage.rows[0].seconds_used);
      const owner = session.owner_user_id === auth.userId;
      const updated = await client.query<LiveSession>(`update couple_live_sessions set
        owner_device_id = case when $2 then $3 else owner_device_id end,
        viewer_device_id = case when not $2 then $3 else viewer_device_id end,
        owner_seen_at = case when $2 then now() else owner_seen_at end,
        viewer_seen_at = case when not $2 then now() else viewer_seen_at end,
        status = case when $4 = 0 then 'ended' when $2 then 'active' else status end,
        ended_reason = case when $4 = 0 then 'limit_reached' else ended_reason end,
        last_billed_at = $5::timestamptz, expires_at = now() + interval '20 seconds' where id = $1 returning *`, [id, owner, auth.sessionId, remainingSeconds, billedThrough]);
      return { session: updated.rows[0], remainingSeconds };
    });
    if (result.session.status === 'ended') await this.closeRoom(id);
    return result;
  }

  async screenToken(auth: Auth, id: string) {
    const { session, remainingSeconds } = await this.heartbeat(auth, id);
    if (session.feature !== 'screen' || session.status === 'ended' || remainingSeconds <= 0) throw new AppError(403, 'This screen session is not available.', 'LIVE_ACCESS_DENIED');
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: `${auth.userId}:${auth.sessionId}`, ttl: 60
    });
    token.addGrant({ roomJoin: true, room: `couple-screen-${id}`, canSubscribe: auth.userId === session.viewer_user_id,
      canPublish: auth.userId === session.owner_user_id, canPublishData: false, canPublishSources: [TrackSource.SCREEN_SHARE] });
    return { url: env.LIVEKIT_URL, token: await token.toJwt(), roomName: `couple-screen-${id}`, expiresInSeconds: 60 };
  }

  async snapshot(auth: Auth, id: string, sequence: number, ciphertext: string) {
    return withTransaction(async (client) => {
      const session = await authorize(client, auth, id);
      if (session.status !== 'active' || session.feature !== 'typing' || session.owner_user_id !== auth.userId) throw new AppError(403, 'Live typing is not active.', 'LIVE_ACCESS_DENIED');
      if (!session.viewer_device_id) return { relayed: false };
      const updated = await client.query(`update couple_live_sessions set last_sequence = $2 where id = $1
        and status = 'active' and last_sequence < $2 returning id`, [id, sequence]);
      if (!updated.rows.length) throw new AppError(409, 'Draft snapshot is out of order.', 'LIVE_SEQUENCE_REJECTED');
      // A transient relay under the authorization lock cannot race a committed revoke.
      // Only its sequence is durable. Failed transmission is deliberately not replayed.
      relayService.sendEventToSession(session.viewer_device_id, { type: 'couple_live_draft', sessionId: id, sequence, ciphertext, expiresInSeconds: 10 });
      return { relayed: true };
    });
  }

  async end(auth: Auth, id: string) {
    const session = await this.get(auth, id);
    await pool.query("update couple_live_sessions set status = 'ended', ended_reason = 'stopped' where id = $1", [id]);
    relayService.sendEventToUser(session.owner_user_id, { type: 'couple_live_ended', sessionId: id });
    relayService.sendEventToUser(session.viewer_user_id, { type: 'couple_live_ended', sessionId: id });
    await this.closeRoom(id);
    return { ended: true };
  }

  async closeRoom(id: string) {
    const result = await pool.query<LiveSession>('select * from couple_live_sessions where id = $1', [id]);
    const session = result.rows[0];
    if (session) {
      relayService.sendEventToUser(session.owner_user_id, { type: 'couple_live_ended', sessionId: id });
      relayService.sendEventToUser(session.viewer_user_id, { type: 'couple_live_ended', sessionId: id });
      if (session.feature !== 'screen') return;
    }
    if (!env.LIVEKIT_URL) return;
    try {
      const admin = rtcAdmin();
      const room = `couple-screen-${id}`;
      const participants = await admin.listParticipants(room);
      for (const participant of participants) await admin.removeParticipant(room, participant.identity);
      await admin.deleteRoom(room);
    }
    catch { /* Local capture also fails closed when authorization/heartbeat fails. */ }
  }

  async sweep() {
    await pool.query("update couple_live_sessions set status = 'ended', ended_reason = 'expired' where status <> 'ended' and expires_at <= now()");
    const ended = await pool.query<{ id: string }>("select session_id as id from couple_rtc_cleanup where expires_at > now() limit 100");
    for (const session of ended.rows) await this.closeRoom(session.id);
    await pool.query('delete from couple_rtc_cleanup where expires_at <= now()');
    await pool.query('delete from direct_messages where expires_at <= now() and message_id in (select message_id from couple_message_links)');
  }
}

export const coupleLiveService = new CoupleLiveService();

import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';

export async function requireCouple(client: Pick<PoolClient, 'query'>, userId: string, coupleId?: string) {
  const result = await client.query<{ id: string; partner_id: string; username: string }>(`
    select r.id, peer.user_id as partner_id, u.username
    from couple_members me
    join couple_relationships r on r.id = me.couple_id and r.status = 'active'
    join couple_members peer on peer.couple_id = r.id and peer.user_id <> me.user_id
    join users u on u.id = peer.user_id
    where me.user_id = $1 and ($2::uuid is null or r.id = $2)
      and not exists (select 1 from blocked_users b where
        (b.blocker_user_id = me.user_id and b.blocked_user_id = peer.user_id) or
        (b.blocker_user_id = peer.user_id and b.blocked_user_id = me.user_id))
    for update of r
  `, [userId, coupleId ?? null]);
  const pair = result.rows[0];
  if (!pair) throw new AppError(403, 'Connect with your partner first.', 'COUPLE_ACCESS_DENIED');
  return { id: pair.id, partnerId: pair.partner_id, partnerUsername: pair.username };
}

export class CouplesService {
  async current(userId: string) {
    let couple = null;
    try { couple = await requireCouple(pool, userId); }
    catch (error) { if (!(error instanceof AppError) || error.code !== 'COUPLE_ACCESS_DENIED') throw error; }
    const invitations = await pool.query(`
      select i.id, i.sender_user_id as "senderId", sender.username as "senderUsername",
        i.recipient_user_id as "recipientId", recipient.username as "recipientUsername", i.expires_at as "expiresAt"
      from couple_invitations i join users sender on sender.id = i.sender_user_id
      join users recipient on recipient.id = i.recipient_user_id
      where (i.sender_user_id = $1 or i.recipient_user_id = $1) and i.status = 'pending' and i.expires_at > now()
      order by i.created_at desc limit 20
    `, [userId]);
    return { couple, invitations: invitations.rows };
  }

  async invite(userId: string, username: string) {
    return withTransaction(async (client) => {
      const target = await client.query<{ id: string }>('select id from users where lower(username) = lower($1)', [username]);
      const peer = target.rows[0]?.id;
      if (!peer || peer === userId) throw new AppError(400, 'Choose another Kryno account.', 'INVALID_PARTNER');
      await client.query('select id from users where id = any($1::uuid[]) order by id for update', [[userId, peer]]);
      const blocked = await client.query(`select 1 from blocked_users where
        (blocker_user_id = $1 and blocked_user_id = $2) or (blocker_user_id = $2 and blocked_user_id = $1)`, [userId, peer]);
      const members = await client.query('select 1 from couple_members where user_id = any($1::uuid[])', [[userId, peer]]);
      if (blocked.rows.length || members.rows.length) throw new AppError(409, 'This partner connection is not available.', 'PARTNER_UNAVAILABLE');
      await client.query("update couple_invitations set status = 'cancelled' where sender_user_id = $1 and recipient_user_id = $2 and status = 'pending' and expires_at <= now()", [userId, peer]);
      const result = await client.query(`insert into couple_invitations(sender_user_id, recipient_user_id)
        values ($1, $2) on conflict (sender_user_id, recipient_user_id) where status = 'pending'
        do update set sender_user_id = excluded.sender_user_id returning id`, [userId, peer]);
      return { invitationId: result.rows[0].id };
    });
  }

  async respond(userId: string, id: string, accept: boolean) {
    return withTransaction(async (client) => {
      const result = await client.query<{ sender_user_id: string; recipient_user_id: string }>(`
        select sender_user_id, recipient_user_id from couple_invitations
        where id = $1 and status = 'pending' and expires_at > now() for update`, [id]);
      const invite = result.rows[0];
      if (!invite || invite.recipient_user_id !== userId) throw new AppError(403, 'This invitation is not available.', 'INVITATION_ACCESS_DENIED');
      if (!accept) {
        await client.query("update couple_invitations set status = 'declined' where id = $1", [id]);
        return { accepted: false };
      }
      await client.query('select id from users where id = any($1::uuid[]) order by id for update', [[userId, invite.sender_user_id]]);
      const members = await client.query('select 1 from couple_members where user_id = any($1::uuid[])', [[userId, invite.sender_user_id]]);
      const blocked = await client.query(`select 1 from blocked_users where
        (blocker_user_id = $1 and blocked_user_id = $2) or (blocker_user_id = $2 and blocked_user_id = $1)`, [userId, invite.sender_user_id]);
      if (members.rows.length || blocked.rows.length) throw new AppError(409, 'This partner connection is not available.', 'PARTNER_UNAVAILABLE');
      const pair = await client.query<{ id: string }>('insert into couple_relationships default values returning id');
      await client.query('insert into couple_members(user_id, couple_id) values ($1, $3), ($2, $3)', [userId, invite.sender_user_id, pair.rows[0].id]);
      await client.query('insert into couple_permissions(couple_id, owner_user_id) values ($3, $1), ($3, $2)', [userId, invite.sender_user_id, pair.rows[0].id]);
      await client.query("update couple_invitations set status = 'accepted' where id = $1", [id]);
      await client.query("update couple_invitations set status = 'cancelled' where status = 'pending' and (sender_user_id = any($1::uuid[]) or recipient_user_id = any($1::uuid[]))", [[userId, invite.sender_user_id]]);
      return { accepted: true, coupleId: pair.rows[0].id };
    });
  }

  async cancel(userId: string, id: string) {
    const result = await pool.query("update couple_invitations set status = 'cancelled' where id = $1 and sender_user_id = $2 and status = 'pending' returning id", [id, userId]);
    if (!result.rows.length) throw new AppError(403, 'This invitation is not available.', 'INVITATION_ACCESS_DENIED');
    return { cancelled: true };
  }

  async unlink(userId: string) {
    return withTransaction(async (client) => {
      const pair = await requireCouple(client, userId);
      await client.query("update couple_relationships set status = 'ended', ended_at = now() where id = $1", [pair.id]);
      return { unlinked: true };
    });
  }
}

export const couplesService = new CouplesService();

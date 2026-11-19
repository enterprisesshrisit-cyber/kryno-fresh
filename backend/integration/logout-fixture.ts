import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../src/db/pool.js';
import { activatePushOwner, lockPushInstallation } from '../src/services/push-ownership.service.js';
import { sha256 } from '../src/utils/crypto.js';

export async function deriveFixture(options: { deviceId?: string; account?: string } = {}) {
  const user = options.account ?? randomUUID();
  const deviceId = options.deviceId ?? randomUUID();
  const family = randomUUID();
  const fingerprint = sha256(randomUUID());
  const proof = sha256(`only used by disposable fixture for ${deviceId}`);
  const session = await withTransaction(async client => {
    await lockPushInstallation(client, deviceId);
    if (!options.account) {
      const handle = `fixture_${user.slice(0, 8)}`;
      await client.query('insert into users (id,username,email,password_hash) values ($1,$2,$3,$4)',
        [user, handle, `${handle}@example.invalid`, 'not-a-sign-in-password']);
    }
    const device = await client.query<{ id: string }>(`insert into device_sessions (user_id, device_id, device_public_key)
      values ($1,$2,'fixture-only') on conflict (user_id,device_id) do update set device_public_key=excluded.device_public_key
      returning id`, [user, deviceId]);
    const id = device.rows[0].id;
    const successor = randomUUID();
    await client.query(`insert into refresh_tokens (id,user_id,device_session_id,token_family_id,token_hash,expires_at)
      values ($1,$2,$3,$4,$5,now()+interval '1 day')`, [successor, user, id, family, sha256(randomUUID())]);
    await client.query(`insert into refresh_tokens (user_id,device_session_id,token_family_id,token_hash,expires_at,revoked_at,replaced_by_token_id)
      values ($1,$2,$3,$4,now()-interval '1 day',now(),$5)`, [user, id, family, fingerprint, successor]);
    await client.query(`insert into push_installation_credentials (device_id,credential_hash) values ($1,$2)
      on conflict (device_id) do nothing`, [deviceId, sha256(proof)]);
    await activatePushOwner(client, id, deviceId, family);
    await client.query(`update device_sessions d set push_token=$1, push_provider='fcm', message_notification_version=1,
      push_owner_generation=o.generation from push_installation_owners o where d.id=$2 and o.device_id=d.device_id`,
    [randomUUID(), id]);
    return id;
  });
  async function state() {
    const counts = (await pool.query(`select count(*)::int as rows,
      count(*) filter (where revoked_at is null)::int as live, count(*) filter (where reuse_detected)::int as reuse
      from refresh_tokens where token_family_id=$1`, [family])).rows[0];
    const owner = (await pool.query(`select d.push_token is not null and o.generation=d.push_owner_generation as bound,
      o.retired_at is not null as retired,o.token_family_id=$2 as "ownerUnchanged"
      from device_sessions d join push_installation_owners o on o.device_id=d.device_id where d.id=$1`, [session, family])).rows[0];
    return { ...counts, ...owner };
  }
  return { deviceId, account: user, session, fingerprint, proof, state };
}

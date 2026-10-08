import type { PoolClient } from 'pg';

export async function lockPushInstallation(client: PoolClient, deviceId: string) {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`push-installation:${deviceId}`]);
}

// Caller holds the installation lock and commits this with the new login family.
export async function activatePushOwner(client: PoolClient, sessionId: string, deviceId: string, familyId: string) {
  await client.query(`
    insert into push_installation_owners (device_id, device_session_id, token_family_id)
    values ($1, $2, $3)
    on conflict (device_id) do update set
      device_session_id = excluded.device_session_id,
      token_family_id = excluded.token_family_id,
      generation = excluded.generation, activated_at = now(), retired_at = null
  `, [deviceId, sessionId, familyId]);
  await client.query(`
    update device_sessions set push_token = null, push_provider = null,
      push_platform = null, push_token_updated_at = null, push_owner_generation = null
    where device_id = $1
  `, [deviceId]);
}

export async function retirePushOwner(client: PoolClient, sessionId: string, deviceId: string, familyId: string) {
  const retired = await client.query<{ generation: string }>(`
    update push_installation_owners set retired_at = coalesce(retired_at, now())
    where device_id = $1 and device_session_id = $2 and token_family_id = $3
    returning generation
  `, [deviceId, sessionId, familyId]);
  if (retired.rows[0]) {
    await client.query(`
      update device_sessions set push_token = null, push_provider = null,
        push_platform = null, push_token_updated_at = null, push_owner_generation = null
      where id = $1 and push_owner_generation = $2
    `, [sessionId, retired.rows[0].generation]);
  }
}

// Reused for target discovery and revalidation. An old live refresh family is not
// enough: it must still own this installation and this exact registration generation.
export const ACTIVE_PUSH_TARGETS_SQL = `
  select d.id as session_id, d.push_provider, d.push_token, d.push_platform,
    o.generation as push_generation, d.push_scope_version
  from device_sessions d
  join push_installation_owners o on o.device_id = d.device_id
    and o.device_session_id = d.id and o.generation = d.push_owner_generation
  where d.user_id = $1 and d.trusted = true and o.retired_at is null
    and d.push_token is not null and d.push_provider in ('expo', 'fcm')
    and exists (select 1 from refresh_tokens r
      where r.device_session_id = d.id and r.user_id = d.user_id
        and r.token_family_id = o.token_family_id
        and r.revoked_at is null and r.expires_at > now())
`;

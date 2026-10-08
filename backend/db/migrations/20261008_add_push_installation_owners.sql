-- Push ownership changes only on a credential-authenticated login, never a token registration.
create table if not exists push_installation_owners (
  device_id varchar(128) primary key,
  -- Keep the generation tombstone when its session is removed; migration replay
  -- must not reactivate an older account still sharing this installation ID.
  device_session_id uuid references device_sessions(id) on delete set null,
  token_family_id uuid not null,
  generation uuid not null unique default gen_random_uuid(),
  activated_at timestamptz not null default now(),
  retired_at timestamptz
);

alter table device_sessions add column if not exists push_owner_generation uuid;
create unique index if not exists device_sessions_active_push_token_idx
  on device_sessions (push_provider, push_token)
  where push_token is not null and push_owner_generation is not null;
create index if not exists push_installation_owners_session_idx
  on push_installation_owners (device_session_id);

-- Use the original login time, not the latest refresh/registration time. Never
-- resurrect an older family after logout; ambiguous same-time logins stay retired.
with families as (
  select d.device_id, d.id as device_session_id, r.token_family_id,
    min(r.issued_at) as login_at,
    bool_or(r.revoked_at is null and r.expires_at > now()) and d.trusted as active
  from device_sessions d join refresh_tokens r on r.device_session_id = d.id
  group by d.device_id, d.id, r.token_family_id, d.trusted
), ranked as (
  select *, dense_rank() over (partition by device_id order by login_at desc) as recency
  from families
), latest as (
  select *, count(*) over (partition by device_id) as candidates,
    row_number() over (partition by device_id order by device_session_id, token_family_id) as candidate
  from ranked where recency = 1
)
insert into push_installation_owners (device_id, device_session_id, token_family_id, activated_at, retired_at)
select device_id, device_session_id, token_family_id, login_at,
  case when active and candidates = 1 then null else now() end
from latest where candidate = 1
on conflict (device_id) do nothing;

-- No legacy push token is promoted implicitly. Clients refresh their access token
-- and register again. This table contains routing authority, not client-readable data.
alter table push_installation_owners enable row level security;
revoke all on push_installation_owners from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on push_installation_owners from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on push_installation_owners from authenticated';
  end if;
end $$;

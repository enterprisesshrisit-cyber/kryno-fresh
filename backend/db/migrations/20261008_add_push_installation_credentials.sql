-- Installation possession is separate from a caller-supplied device ID.
-- Never enroll existing installations from unauthenticated migration data.
create table if not exists push_installation_credentials (
  device_id varchar(128) primary key,
  credential_hash varchar(64) not null check (credential_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table push_installation_credentials enable row level security;
revoke all on push_installation_credentials from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on push_installation_credentials from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on push_installation_credentials from authenticated';
  end if;
end $$;

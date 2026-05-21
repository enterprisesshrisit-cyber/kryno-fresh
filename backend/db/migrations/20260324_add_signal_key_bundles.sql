create table if not exists signal_key_bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_session_id uuid not null unique references device_sessions(id) on delete cascade,
  registration_id integer not null,
  identity_public_key text not null,
  signed_prekey_id integer not null,
  signed_prekey_public_key text not null,
  signed_prekey_signature text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signal_key_bundles_user_idx on signal_key_bundles(user_id);

create table if not exists signal_one_time_prekeys (
  id uuid primary key default gen_random_uuid(),
  device_session_id uuid not null references device_sessions(id) on delete cascade,
  key_id integer not null,
  public_key text not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (device_session_id, key_id)
);

create index if not exists signal_one_time_prekeys_device_idx on signal_one_time_prekeys(device_session_id, claimed_at);

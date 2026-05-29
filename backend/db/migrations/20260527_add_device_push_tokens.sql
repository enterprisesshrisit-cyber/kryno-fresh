alter table if exists device_sessions
  add column if not exists push_provider varchar(24),
  add column if not exists push_token text,
  add column if not exists push_platform varchar(16),
  add column if not exists push_token_updated_at timestamptz;

create index if not exists device_sessions_push_token_idx
  on device_sessions(user_id, push_provider, push_token_updated_at desc)
  where push_token is not null and trusted = true;

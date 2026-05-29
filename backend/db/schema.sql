create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username varchar(32) not null unique,
  email varchar(320) not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_username_format check (username ~ '^[a-zA-Z0-9_]{3,32}$')
);

create table if not exists device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_id varchar(128) not null,
  device_name varchar(120),
  device_public_key text not null,
  push_provider varchar(24),
  push_token text,
  push_platform varchar(16),
  push_token_updated_at timestamptz,
  trusted boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_seen_ip inet,
  last_seen_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_session_id uuid not null references device_sessions(id) on delete cascade,
  token_family_id uuid not null,
  token_hash varchar(64) not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_token_id uuid references refresh_tokens(id) on delete set null,
  reuse_detected boolean not null default false,
  created_by_ip inet,
  user_agent text
);

create index if not exists refresh_tokens_user_device_idx on refresh_tokens(user_id, device_session_id);
create index if not exists refresh_tokens_family_idx on refresh_tokens(token_family_id);
create index if not exists device_sessions_push_token_idx on device_sessions(user_id, push_provider, push_token_updated_at desc)
  where push_token is not null and trusted = true;

create table if not exists email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists email_verification_tokens
  add column if not exists attempt_count integer not null default 0;

create index if not exists email_verification_tokens_user_idx on email_verification_tokens(user_id);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_idx on password_reset_tokens(user_id, created_at desc);

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

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique,
  sender_user_id uuid not null references users(id) on delete cascade,
  sender_device_session_id uuid not null references device_sessions(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  recipient_device_session_id uuid references device_sessions(id) on delete cascade,
  message_type varchar(32) not null,
  ciphertext text not null,
  encrypted_content_type varchar(32) not null default 'signal',
  client_created_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivery_attempts integer not null default 0
);

create index if not exists direct_messages_recipient_idx on direct_messages(recipient_user_id, server_received_at);
create index if not exists direct_messages_expiry_idx on direct_messages(expires_at);

create table if not exists direct_attachments (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references users(id) on delete cascade,
  sender_device_session_id uuid not null references device_sessions(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  recipient_device_session_id uuid references device_sessions(id) on delete cascade,
  storage_key text not null unique,
  original_file_name text not null,
  original_mime_type text not null,
  encrypted_size integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  recipient_downloaded_at timestamptz
);

create index if not exists direct_attachments_recipient_idx on direct_attachments(recipient_user_id, created_at desc);
create index if not exists direct_attachments_expiry_idx on direct_attachments(expires_at);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  kind varchar(16) not null,
  storage_key text not null unique,
  public_url text not null,
  mime_type text not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint media_assets_kind_check check (kind in ('avatar', 'post', 'story'))
);

create index if not exists media_assets_owner_idx on media_assets(owner_user_id, kind, created_at desc);

create table if not exists user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name varchar(80),
  bio varchar(280),
  avatar_media_id uuid references media_assets(id) on delete set null,
  profile_visibility varchar(16) not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_visibility_check check (profile_visibility in ('public', 'followers'))
);

create table if not exists follows (
  follower_user_id uuid not null references users(id) on delete cascade,
  followee_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followee_user_id),
  constraint follows_not_self check (follower_user_id <> followee_user_id)
);

create index if not exists follows_followee_idx on follows(followee_user_id, created_at desc);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references users(id) on delete cascade,
  media_asset_id uuid references media_assets(id) on delete set null,
  media_kind varchar(16) not null default 'text',
  caption varchar(500) not null default '',
  visibility varchar(16) not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_visibility_check check (visibility in ('public', 'followers')),
  constraint posts_media_kind_check check (media_kind in ('text', 'image', 'video'))
);

create index if not exists posts_feed_idx on posts(created_at desc);
create index if not exists posts_author_idx on posts(author_user_id, created_at desc);

create table if not exists post_likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_user_id uuid not null references users(id) on delete cascade,
  body varchar(280) not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on post_comments(post_id, created_at desc);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references users(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  caption varchar(280) not null default '',
  visibility varchar(16) not null default 'public',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint stories_visibility_check check (visibility in ('public', 'followers', 'private_circle'))
);

create index if not exists stories_author_idx on stories(author_user_id, created_at desc);
create index if not exists stories_expiry_idx on stories(expires_at);

create table if not exists story_views (
  story_id uuid not null references stories(id) on delete cascade,
  viewer_user_id uuid not null references users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_user_id)
);

create table if not exists user_subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  provider varchar(32) not null default 'revenuecat',
  provider_app_user_id text not null unique,
  entitlement_id text not null default 'kryno_plus',
  product_id text,
  platform text,
  status varchar(32) not null,
  current_period_ends_at timestamptz,
  original_transaction_id text,
  latest_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_check check (
    status in ('active', 'cancelled_active', 'billing_issue', 'expired', 'refunded', 'paused', 'unknown')
  )
);

create index if not exists user_subscriptions_status_idx on user_subscriptions(status, current_period_ends_at);

create table if not exists billing_webhook_events (
  id text primary key,
  provider varchar(32) not null,
  event_type text not null,
  app_user_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index if not exists billing_webhook_events_app_user_idx on billing_webhook_events(provider, app_user_id, received_at desc);

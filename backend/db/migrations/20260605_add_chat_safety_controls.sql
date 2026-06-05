create table if not exists direct_conversation_settings (
  user_id uuid not null references users(id) on delete cascade,
  peer_user_id uuid not null references users(id) on delete cascade,
  theme_id varchar(48) not null default 'dark_glass',
  muted boolean not null default false,
  focus_mode boolean not null default false,
  private_mode boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, peer_user_id),
  constraint direct_conversation_settings_not_self check (user_id <> peer_user_id)
);

create index if not exists direct_conversation_settings_peer_idx
  on direct_conversation_settings(peer_user_id, user_id);

create table if not exists blocked_users (
  blocker_user_id uuid not null references users(id) on delete cascade,
  blocked_user_id uuid not null references users(id) on delete cascade,
  reason varchar(120),
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint blocked_users_not_self check (blocker_user_id <> blocked_user_id)
);

create index if not exists blocked_users_blocked_idx
  on blocked_users(blocked_user_id, created_at desc);

create table if not exists user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references users(id) on delete cascade,
  reported_user_id uuid not null references users(id) on delete cascade,
  category varchar(64) not null default 'other',
  description varchar(1000) not null default '',
  status varchar(24) not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint user_reports_not_self check (reporter_user_id <> reported_user_id),
  constraint user_reports_status_check check (status in ('open', 'reviewing', 'resolved', 'dismissed'))
);

create index if not exists user_reports_reported_idx
  on user_reports(reported_user_id, status, created_at desc);

create index if not exists user_reports_reporter_idx
  on user_reports(reporter_user_id, created_at desc);

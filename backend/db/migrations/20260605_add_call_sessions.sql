create table if not exists call_sessions (
  call_id text primary key,
  mode varchar(16) not null,
  caller_user_id uuid not null references users(id) on delete cascade,
  caller_device_session_id uuid not null references device_sessions(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  accepted_device_session_id uuid references device_sessions(id) on delete set null,
  media_provider varchar(16) not null default 'livekit',
  room_name text,
  state varchar(24) not null default 'ringing',
  started_at timestamptz not null default now(),
  accepted_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null,
  end_reason text,
  updated_at timestamptz not null default now(),
  constraint call_sessions_mode_check check (mode in ('audio', 'video')),
  constraint call_sessions_media_provider_check check (media_provider in ('livekit', 'webrtc')),
  constraint call_sessions_state_check check (
    state in (
      'ringing',
      'connecting',
      'connected',
      'ended',
      'missed',
      'declined',
      'cancelled',
      'expired',
      'unavailable',
      'failed'
    )
  )
);

create index if not exists call_sessions_recipient_state_idx
  on call_sessions(recipient_user_id, state, updated_at desc);

create index if not exists call_sessions_caller_state_idx
  on call_sessions(caller_user_id, state, updated_at desc);

create index if not exists call_sessions_expiry_idx
  on call_sessions(expires_at)
  where ended_at is null;

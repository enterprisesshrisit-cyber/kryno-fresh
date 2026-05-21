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

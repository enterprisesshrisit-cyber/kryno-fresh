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

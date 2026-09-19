create table if not exists direct_message_deliveries (
  message_id uuid not null references direct_messages(message_id) on delete cascade,
  device_session_id uuid not null references device_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  acked_at timestamptz,
  primary key (message_id, device_session_id)
);

create index if not exists direct_message_deliveries_pending_idx
  on direct_message_deliveries(device_session_id, created_at)
  where acked_at is null;

-- Preserve pending deliveries created by older releases. Device-targeted
-- messages remain targeted; account-targeted messages fan out to every
-- currently trusted device owned by the recipient.
insert into direct_message_deliveries (message_id, device_session_id)
select dm.message_id, dm.recipient_device_session_id
from direct_messages dm
where dm.recipient_device_session_id is not null
on conflict (message_id, device_session_id) do nothing;

insert into direct_message_deliveries (message_id, device_session_id)
select dm.message_id, ds.id
from direct_messages dm
join device_sessions ds
  on ds.user_id = dm.recipient_user_id
 and ds.trusted = true
where dm.recipient_device_session_id is null
on conflict (message_id, device_session_id) do nothing;

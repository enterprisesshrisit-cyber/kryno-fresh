-- Deploy before the capability-compatible backend. Roll back policy/code, not
-- these additive columns. Legacy messages have no provable target snapshot.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table device_sessions add column if not exists message_notification_version smallint not null default 0;
alter table direct_messages add column if not exists notification_target_session_ids uuid[];
alter table direct_messages add column if not exists notification_is_control boolean;

do $$
begin
  if not exists (
    select 1 from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = 'device_sessions'::regclass and a.attname = 'message_notification_version'
      and a.atttypid = 'smallint'::regtype and a.attnotnull and not a.attisdropped
      and pg_get_expr(d.adbin, d.adrelid) in ('0', '0::smallint')
  ) then raise exception 'Incompatible message_notification_version column'; end if;
  if not exists (select 1 from pg_attribute where attrelid = 'direct_messages'::regclass
    and attname = 'notification_target_session_ids' and atttypid = 'uuid[]'::regtype and not attisdropped
    and not attnotnull and not atthasdef)
    or not exists (select 1 from pg_attribute where attrelid = 'direct_messages'::regclass
    and attname = 'notification_is_control' and atttypid = 'boolean'::regtype and not attisdropped
    and not attnotnull and not atthasdef)
  then raise exception 'Incompatible canonical notification columns'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'device_sessions'::regclass
    and conname = 'device_sessions_message_notification_version_check') then
    alter table device_sessions add constraint device_sessions_message_notification_version_check
      check (message_notification_version in (0, 1));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'device_sessions'::regclass
    and conname = 'device_sessions_message_notification_version_check' and contype = 'c'
    and pg_get_expr(conbin, conrelid) = '(message_notification_version = ANY (ARRAY[0, 1]))')
  then raise exception 'Incompatible message notification constraint'; end if;
end $$;
alter table device_sessions validate constraint device_sessions_message_notification_version_check;

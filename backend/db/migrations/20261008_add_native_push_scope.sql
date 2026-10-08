-- Capability is opt-in. Existing registrations retain their old wire format;
-- updated Android clients require a scoped data-only registration response.
alter table device_sessions add column if not exists push_scope_version smallint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'device_sessions'::regclass
    and conname = 'device_sessions_push_scope_version_check') then
    alter table device_sessions add constraint device_sessions_push_scope_version_check
      check (push_scope_version in (0, 1));
  end if;
end $$;

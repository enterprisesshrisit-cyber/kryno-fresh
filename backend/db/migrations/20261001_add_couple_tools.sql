create table couple_relationships (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table couple_members (
  user_id uuid primary key references users(id) on delete cascade,
  couple_id uuid not null references couple_relationships(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (couple_id, user_id)
);
create index couple_members_relationship_idx on couple_members(couple_id);

create table couple_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references users(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  check (sender_user_id <> recipient_user_id)
);
create index couple_invitations_recipient_idx on couple_invitations(recipient_user_id, created_at desc);
create unique index couple_invitations_pending_idx on couple_invitations(sender_user_id, recipient_user_id) where status = 'pending';

create table couple_permissions (
  couple_id uuid not null,
  owner_user_id uuid not null,
  trusted_screen boolean not null default false,
  live_typing boolean not null default false,
  screen_requests boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (couple_id, owner_user_id),
  foreign key (couple_id, owner_user_id) references couple_members(couple_id, user_id) on delete cascade
);

create table couple_message_links (
  message_id uuid primary key references direct_messages(message_id) on delete cascade,
  couple_id uuid not null references couple_relationships(id) on delete cascade
);
create index couple_message_links_couple_idx on couple_message_links(couple_id);

-- This short-lived cleanup queue survives account/device deletion.
create table couple_rtc_cleanup (
  session_id uuid primary key,
  owner_identity text,
  viewer_identity text,
  expires_at timestamptz not null
);

create table couple_live_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couple_relationships(id) on delete cascade,
  feature text not null check (feature in ('screen', 'typing')),
  owner_user_id uuid not null references users(id) on delete cascade,
  viewer_user_id uuid not null references users(id) on delete cascade,
  owner_device_id uuid references device_sessions(id) on delete cascade,
  viewer_device_id uuid references device_sessions(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'active', 'ended')),
  owner_seen_at timestamptz,
  viewer_seen_at timestamptz,
  last_billed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 seconds',
  ended_reason text,
  cleanup_until timestamptz,
  last_sequence bigint not null default 0,
  created_at timestamptz not null default now(),
  check (owner_user_id <> viewer_user_id)
);
create unique index couple_live_owner_idx on couple_live_sessions(owner_user_id, feature) where status <> 'ended';
create index couple_live_expiry_idx on couple_live_sessions(expires_at) where status <> 'ended';
create index couple_live_cleanup_idx on couple_live_sessions(cleanup_until) where status = 'ended';

create function schedule_couple_live_cleanup() returns trigger language plpgsql as $$
begin
  if new.status = 'ended' and old.status <> 'ended' then
    new.cleanup_until = now() + interval '90 seconds';
    if new.feature = 'screen' then
      insert into couple_rtc_cleanup(session_id, owner_identity, viewer_identity, expires_at)
      values (new.id, new.owner_user_id || ':' || new.owner_device_id,
        new.viewer_user_id || ':' || new.viewer_device_id, new.cleanup_until)
      on conflict (session_id) do update set expires_at = excluded.expires_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger couple_live_cleanup before update of status on couple_live_sessions for each row execute function schedule_couple_live_cleanup();

create table couple_feature_usage (
  user_id uuid not null references users(id) on delete cascade,
  feature text not null check (feature in ('screen', 'typing')),
  usage_date date not null,
  seconds_used integer not null default 0 check (seconds_used >= 0),
  primary key (user_id, feature, usage_date)
);

create function end_couple_access() returns trigger language plpgsql as $$
begin
  if new.status = 'ended' and old.status <> 'ended' then
    update couple_live_sessions set status = 'ended', ended_reason = 'relationship_ended' where couple_id = new.id and status <> 'ended';
    delete from direct_messages where message_id in (select message_id from couple_message_links where couple_id = new.id);
    delete from couple_members where couple_id = new.id;
  end if;
  return new;
end;
$$;
create trigger couple_end_access after update of status on couple_relationships for each row execute function end_couple_access();

create function revoke_blocked_couple() returns trigger language plpgsql as $$
begin
  update couple_relationships set status = 'ended', ended_at = now()
  where id in (
    select a.couple_id from couple_members a join couple_members b on b.couple_id = a.couple_id
    where a.user_id = new.blocker_user_id and b.user_id = new.blocked_user_id
  ) and status = 'active';
  return new;
end;
$$;
create trigger couple_block_access after insert on blocked_users for each row execute function revoke_blocked_couple();

create function revoke_deleted_couple() returns trigger language plpgsql as $$
begin
  update couple_relationships set status = 'ended', ended_at = now()
  where id in (select couple_id from couple_members where user_id = old.id) and status = 'active';
  return old;
end;
$$;
create trigger couple_delete_access before delete on users for each row execute function revoke_deleted_couple();

-- Password/security reset and loss of all trusted devices revoke standing access.
create function revoke_couple_security_access() returns trigger language plpgsql as $$
begin
  update couple_permissions set trusted_screen = false, live_typing = false, updated_at = now()
    where owner_user_id = new.id;
  update couple_live_sessions set status = 'ended', ended_reason = 'security_reset'
    where status <> 'ended' and (owner_user_id = new.id or viewer_user_id = new.id);
  return new;
end;
$$;
create trigger couple_password_reset after update of password_hash on users for each row
  when (old.password_hash is distinct from new.password_hash) execute function revoke_couple_security_access();

create function revoke_couple_device_access() returns trigger language plpgsql as $$
begin
  if not new.trusted then
    update couple_live_sessions set status = 'ended', ended_reason = 'device_revoked'
      where status <> 'ended' and (owner_device_id = new.id or viewer_device_id = new.id);
    if not exists (select 1 from device_sessions where user_id = new.user_id and trusted) then
      update couple_permissions set trusted_screen = false, live_typing = false, updated_at = now()
        where owner_user_id = new.user_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger couple_device_revoke after update of trusted on device_sessions for each row execute function revoke_couple_device_access();

create function revoke_couple_after_logout() returns trigger language plpgsql as $$
begin
  if new.revoked_at is not null and old.revoked_at is null
    and not exists (select 1 from refresh_tokens where user_id = new.user_id and revoked_at is null and expires_at > now()) then
    update couple_permissions set trusted_screen = false, live_typing = false, updated_at = now() where owner_user_id = new.user_id;
    update couple_live_sessions set status = 'ended', ended_reason = 'logged_out'
      where status <> 'ended' and (owner_user_id = new.user_id or viewer_user_id = new.user_id);
  end if;
  return new;
end;
$$;
create trigger couple_logout_revoke after update of revoked_at on refresh_tokens for each row execute function revoke_couple_after_logout();

-- Custom JWT authentication is enforced by the API, not Supabase client JWTs.
-- No direct mobile/anon policies or grants; the server's database role owns these tables.
alter table couple_relationships enable row level security;
alter table couple_members enable row level security;
alter table couple_invitations enable row level security;
alter table couple_permissions enable row level security;
alter table couple_message_links enable row level security;
alter table couple_live_sessions enable row level security;
alter table couple_feature_usage enable row level security;
alter table couple_rtc_cleanup enable row level security;
revoke all on couple_relationships, couple_members, couple_invitations, couple_permissions,
  couple_message_links, couple_live_sessions, couple_feature_usage, couple_rtc_cleanup from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on couple_relationships, couple_members, couple_invitations, couple_permissions, couple_message_links, couple_live_sessions, couple_feature_usage, couple_rtc_cleanup from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on couple_relationships, couple_members, couple_invitations, couple_permissions, couple_message_links, couple_live_sessions, couple_feature_usage, couple_rtc_cleanup from authenticated';
  end if;
end;
$$;

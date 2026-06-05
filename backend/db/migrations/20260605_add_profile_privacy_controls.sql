alter table user_profiles
  add column if not exists posts_visibility varchar(16) not null default 'public';

alter table user_profiles
  add column if not exists message_visibility varchar(16) not null default 'public';

do $$
begin
  alter table user_profiles
    add constraint user_profiles_posts_visibility_check
    check (posts_visibility in ('public', 'followers'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table user_profiles
    add constraint user_profiles_message_visibility_check
    check (message_visibility in ('public', 'followers', 'none'));
exception
  when duplicate_object then null;
end $$;

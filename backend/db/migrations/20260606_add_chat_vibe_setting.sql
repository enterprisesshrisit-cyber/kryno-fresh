alter table direct_conversation_settings
  add column if not exists vibe_id varchar(48) not null default 'silent';

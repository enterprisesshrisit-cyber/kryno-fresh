set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Only a digest of a random attempt identifier; no additional bearer material.
alter table refresh_tokens add column if not exists recovery_attempt_digest varchar(64);

do $$
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'refresh_tokens'::regclass and attname = 'recovery_attempt_digest'
      and format_type(atttypid, atttypmod) = 'character varying(64)'
      and not attisdropped and not attnotnull and not atthasdef
  ) then
    raise exception 'Incompatible refresh recovery attempt column';
  end if;
end $$;

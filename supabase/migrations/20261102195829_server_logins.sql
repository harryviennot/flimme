-- M1.12: one database login per server process, and a narrower role for the
-- internet-facing HTTP API (security.md#the-database-gaps-found, gap 11).
-- No password is set here: Harry sets one per login in each project by hand
-- (operations.md#secrets), so no secret ever enters git.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Roles belong to the whole cluster, so each is created only if it's missing,
-- as the baseline does for app_server. A role that already exists from another
-- database keeps the memberships and settings this file gives it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_http') then
    create role app_http nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'flimme_deck') then
    create role flimme_deck login in role app_server;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'flimme_pipeline') then
    create role flimme_pipeline login in role app_server;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'flimme_trainer') then
    create role flimme_trainer login in role app_server;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'flimme_http') then
    create role flimme_http login in role app_http;
  end if;
end
$$;

-- The HTTP API calls two functions and reads no table. Each later route adds
-- its own read, with a test (Q12.2).
grant usage on schema internal to app_http;
revoke execute on function internal.start_letterboxd_import(uuid, jsonb) from app_server;
grant execute on function internal.start_letterboxd_import(uuid, jsonb), internal.enqueue(text, jsonb) to app_http;

-- The documented statement timeouts (server-structure.md#the-database-layer).
-- The trainer's batch queries have no documented number, so it has none. The
-- server also sets its own per connection.
alter role flimme_deck set statement_timeout = '2s';
alter role flimme_pipeline set statement_timeout = '60s';
alter role flimme_http set statement_timeout = '5s';

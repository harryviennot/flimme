-- M1.7: nothing a later migration creates is reachable by phones unless it is
-- granted on purpose (security.md#the-database-gaps-found, gap 1). The check
-- that pins this is supabase/tests/database/280-exposure.test.sql.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- No "for role": the defaults apply to the role running this migration, which
-- is the role that creates every later object.

-- Postgres lets PUBLIC execute every new function. Per-schema default
-- privileges are only added to the global ones, so this must be the global
-- form: "in schema" would do nothing.
alter default privileges revoke execute on functions from public;

-- Supabase also grants new objects in public to anon and authenticated (and
-- service_role, which is left alone). Those grants are per schema, so they are
-- revoked per schema.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- The baseline revoked the tables of public (views included) but not its
-- sequences.
revoke all on all sequences in schema public from anon, authenticated;

-- Functions that a later "create extension" makes follow the extension owner's
-- defaults (supabase_admin on Supabase), not this revoke, and the check skips
-- extension-owned objects. On the lite database the loading superuser owns
-- them, so this revoke does apply there. A task that adds an extension grants
-- what phones or app_server need.

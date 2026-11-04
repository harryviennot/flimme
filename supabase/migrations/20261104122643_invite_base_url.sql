-- M4.18: the invite domain. The app builds invite links as invite_base_url plus
-- /join/<code>?r=<room id> (decisions.md, M4.12 Q12.1), so this row turns them into
-- https://flimme.com links. Staging and production get the same value (Q18.3).
-- Data only: no function changes.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- An existing value is kept: a project may have set its own already.
insert into public.app_config (key, value) values
  ('invite_base_url', '"https://flimme.com"')
on conflict (key) do nothing;

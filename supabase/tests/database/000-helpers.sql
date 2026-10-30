-- pgTAP helpers: the `tests` schema every other test file uses.
--
-- This is the setup hook, the way Supabase's docs describe it (their example is
-- called 000-setup-tests-hooks.sql): `supabase test db` runs the files of
-- supabase/tests in alphabetical order, so the 000- prefix puts this one first.
-- It is not wrapped in a transaction on purpose: what it creates stays for the
-- files that follow. It is itself a (one-check) test file, so it also passes
-- through the lite runner (supabase/lite/test.sh) unchanged.
--
-- The schema stays in the local database until `supabase db reset`. Never put
-- it in a migration.
--
-- How a rule test reads:
--
--   begin;
--   select plan(2);
--   select tests.create_room(3);               -- players p1 (host), p2, p3, all seated
--   select tests.authenticate_as('p2');        -- from here on, p2 is calling
--   select is((select count(*) from api.room_seats), 3::bigint, 'p2 sees all three seats');
--   select tests.clear_authentication();       -- back to the superuser, to inspect tables
--   select is((select state from public.rooms where id = tests.room_id()), 'lobby', 'still in the lobby');
--   select * from finish();
--   rollback;
--
-- Players are named: tests.uid('p2') is always the same uuid, so no variables
-- are needed to hold ids. Set players up first (as the superuser), then act.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- The id of the user with this name. Same name, same id, in every test.
create or replace function tests.uid(p_name text) returns uuid
language sql immutable
as $$
  select md5('tests:' || p_name)::uuid
$$;

-- An auth user, with the profile that the sign-up trigger creates for it.
-- Guests are anonymous users: no email, is_anonymous = true.
-- Inserted directly, so never use these users to sign in on the real stack.
create or replace function tests.create_user(p_name text, p_anonymous boolean default true)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := tests.uid(p_name);
begin
  insert into auth.users (id, aud, role, email, is_anonymous, raw_app_meta_data, raw_user_meta_data)
  values (v_id, 'authenticated', 'authenticated',
          case when p_anonymous then null else p_name || '@example.test' end,
          p_anonymous, '{}', '{}');
  return v_id;
end
$$;

-- A user whose profile is ready to play: display name = p_name, a country
-- (added to public.countries if the seed has not), the default language.
create or replace function tests.create_player(
  p_name text,
  p_country char(2) default 'FR',
  p_anonymous boolean default true
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := tests.create_user(p_name, p_anonymous);
begin
  insert into public.countries (code) values (p_country) on conflict do nothing;
  update public.profiles set display_name = p_name, country = p_country where id = v_id;
  return v_id;
end
$$;

-- Back to the superuser, with no token. Also what authenticate_as does first,
-- so a test can switch from one player to another directly.
create or replace function tests.clear_authentication() returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- Act as a signed-in user, the way the Data API does for a request: the
-- `authenticated` database role plus the token's claims in request.jwt.claims.
-- The is_anonymous claim comes from the user row.
create or replace function tests.authenticate_as(p_name text) returns void
language plpgsql
as $$
declare
  v_anonymous boolean;
begin
  perform tests.clear_authentication();
  select u.is_anonymous into v_anonymous from auth.users u where u.id = tests.uid(p_name);
  if not found then
    raise exception 'tests.authenticate_as: no user named "%", create it first', p_name;
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', tests.uid(p_name), 'role', 'authenticated', 'aud', 'authenticated',
    'is_anonymous', v_anonymous)::text, true);
  set local role authenticated;
end
$$;

-- Act as a caller with the project's public key and no sign-in.
create or replace function tests.authenticate_as_anon() returns void
language plpgsql
as $$
begin
  perform tests.clear_authentication();
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon', 'aud', 'anon')::text, true);
  set local role anon;
end
$$;

-- A room with p_players seated, through the real api functions: players
-- <prefix>1 .. <prefix>N are created (guests, named after their handle), the
-- first creates the room and the others join it by code. Raises if any answer
-- is not 'ok' (a mode that seats fewer players, say). Leaves the session as the
-- superuser. Returns
--   {"room_id", "code", "players": ["p1", ...], "member_ids": [host seat, ...]}
-- and remembers the room for tests.room_id() and tests.room_code().
create or replace function tests.create_room(
  p_players integer default 2,
  p_mode text default 'quick_match',
  p_country char(2) default 'FR',
  p_prefix text default 'p'
) returns jsonb
language plpgsql
as $$
declare
  v_answer jsonb;
  v_room_id uuid;
  v_code text;
  v_names text[] := '{}';
  v_members uuid[] := '{}';
  i integer;
begin
  for i in 1..p_players loop
    v_names := v_names || (p_prefix || i);
    perform tests.create_player(p_prefix || i, p_country);
  end loop;

  perform tests.authenticate_as(v_names[1]);
  v_answer := api.create_room(p_mode, p_country);
  if v_answer->>'status' <> 'ok' then
    raise exception 'tests.create_room: create_room answered %', v_answer;
  end if;
  v_room_id := (v_answer->>'room_id')::uuid;
  v_code := v_answer->>'code';

  for i in 2..p_players loop
    perform tests.authenticate_as(v_names[i]);
    v_answer := api.join_room(v_code);
    if v_answer->>'status' <> 'ok' then
      raise exception 'tests.create_room: % could not join, join_room answered %', v_names[i], v_answer;
    end if;
  end loop;

  perform tests.clear_authentication();
  select array_agg(m.id order by m.joined_at, m.id) into v_members
  from public.room_members m where m.room_id = v_room_id;

  perform set_config('tests.room_id', v_room_id::text, true);
  perform set_config('tests.room_code', v_code, true);
  return jsonb_build_object('room_id', v_room_id, 'code', v_code,
                            'players', to_jsonb(v_names), 'member_ids', to_jsonb(v_members));
end
$$;

-- The room tests.create_room made last in this transaction.
create or replace function tests.room_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('tests.room_id', true), '')::uuid
$$;

create or replace function tests.room_code() returns text
language sql stable
as $$
  select nullif(current_setting('tests.room_code', true), '')
$$;

-- The seat (room_members.id) of a named player in the last room. Security
-- definer, so it also works while a test is acting as a user.
create or replace function tests.member_id(p_name text, p_room_id uuid default tests.room_id())
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.room_members m
  where m.room_id = p_room_id and m.profile_id = tests.uid(p_name)
$$;

-- -------------------------------------------------------------------------
-- Catalog and Realtime fixtures
-- -------------------------------------------------------------------------
-- Everything here is made up: names and ids are invented, never TMDB data.
-- Setup writes only to public tables, so it works on the real stack too, where
-- tests run as `postgres` and not as a superuser.

-- A made-up active movie. The TMDB id comes from the name, so the same name is
-- always the same film (and a second call with that name fails on the unique key).
create or replace function tests.create_title(p_name text) returns bigint
language sql
as $$
  insert into public.titles (media_type, tmdb_id, original_title, original_language, release_date,
                             runtime_min, popularity, vote_average, vote_count, quality_score)
  values ('movie', ('x' || substr(md5('tests:title:' || p_name), 1, 6))::bit(24)::integer + 1000000,
          p_name, 'en', date '2001-01-01', 100, 10, 7.5, 1000, 7.0)
  returning id
$$;

-- The id of the film tests.create_title made with this name.
create or replace function tests.title_id(p_name text) returns bigint
language sql stable
as $$
  select t.id from public.titles t where t.original_title = p_name
$$;

-- A made-up streaming service available in a country (added to
-- public.countries if missing). Calling it again for the same id and country
-- changes nothing but the name.
create or replace function tests.create_provider(p_id integer, p_name text, p_country char(2) default 'FR')
returns integer
language plpgsql
as $$
begin
  insert into public.countries (code) values (p_country) on conflict do nothing;
  insert into public.providers (id, name) values (p_id, p_name)
  on conflict (id) do update set name = excluded.name;
  insert into public.provider_regions (provider_id, country) values (p_id, p_country)
  on conflict do nothing;
  return p_id;
end
$$;

-- Realtime reads the topic of the request from realtime.topic(), and
-- realtime.send overwrites it in this transaction (on lite and on the real
-- stack). Call this right before every read or insert on realtime.messages.
create or replace function tests.use_topic(p_topic text) returns void
language sql
as $$
  select set_config('realtime.topic', p_topic, true)
$$;

-- The payloads broadcast on room:<id> with this event, oldest first. Call it as
-- the superuser. Rows of one transaction share a timestamp, so do not depend
-- on the order inside a test: check counts and keys (->>), never whole payloads
-- (realtime.send adds an id).
create or replace function tests.broadcasts(p_room_id uuid, p_event text) returns setof jsonb
language sql stable
as $$
  select m.payload from realtime.messages m
  where m.topic = 'room:' || p_room_id::text and m.event = p_event
  order by m.inserted_at
$$;

select plan(1);
select ok(true, 'test helpers installed (schema "tests")');
select * from finish();

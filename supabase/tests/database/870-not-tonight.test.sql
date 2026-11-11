-- M6.68: Not tonight on the server (game-modes.md#not-tonight, #apiset_seat_skipsroom-genre_ids-person_ids).
-- Each seat skips up to 3 genres and 3 people in the lobby. At most 4 genres are out tonight per room.
-- A skip takes the genre off every seat's picks; a genre out tonight can't be picked. At Start the skips
-- of every seat still in the room (present or not) become the room's dropped genres and people, so the
-- deal, the offer and the 20-film check all count films after the skips. Nobody learns who skipped what.

begin;
select plan(108);

select tests.use_deck_engine('sql');
select tests.create_catalog(200);
-- Only the catalog's films count, whatever the seed holds.
update public.titles set is_active = false where original_title not like 'Catalog Film %';

-- Made-up genres, on made-up films. 9101: films 1 to 40. 9102: 41 to 80. 9103: 1 to 29 (under 30,
-- not offered). 9104: 81 to 120. 9105: 121 to 150 (exactly 30). 9106: 1 to 185 (skipping it leaves
-- 13 films). 9199: a TV-only genre.
insert into public.genres (id, slug, names, media_types) values
  (9101, 'nt_alpha', '{"en": "Alpha", "fr": "Alpha"}', '{movie}'),
  (9102, 'nt_beta', '{"en": "Beta", "fr": "Bêta"}', '{movie}'),
  (9103, 'nt_gamma', '{"en": "Gamma", "fr": "Gamma"}', '{movie}'),
  (9104, 'nt_delta', '{"en": "Delta", "fr": "Delta"}', '{movie}'),
  (9105, 'nt_epsilon', '{"en": "Epsilon", "fr": "Epsilon"}', '{movie}'),
  (9106, 'nt_zeta', '{"en": "Zeta", "fr": "Zêta"}', '{movie}'),
  (9199, 'nt_tv_only', '{"en": "TV only", "fr": "Télé seulement"}', '{tv}')
on conflict do nothing;

update public.titles t set genre_ids = array_remove(array[
    case when n between 1 and 40 then 9101 end,
    case when n between 41 and 80 then 9102 end,
    case when n between 1 and 29 then 9103 end,
    case when n between 81 and 120 then 9104 end,
    case when n between 121 and 150 then 9105 end,
    case when n between 1 and 185 then 9106 end], null)
from generate_series(1, 200) n
where t.id = tests.film(n);

-- Film 200 is inactive and film 199 is adult: credits there make nobody skippable.
update public.titles set is_active = false where id = tests.film(200);
update public.titles set is_adult = true where id = tests.film(199);

-- Made-up people and credits.
-- 9201: director of 170, cast of 171. 9202: cast of 160 to 169. 9203: writer of 175 only.
-- 9204: cast of the inactive film 200. 9205: cast of the adult film 199. 9206: cast of 181, writer of 182.
-- 9210: cast of 121 to 125. 9211: cast of 190.
insert into public.people (id, name) values
  (9201, 'Dora Directrice'), (9202, 'Cleo Acteur'), (9203, 'Wren Scribe'), (9204, 'Ines Inactif'),
  (9205, 'Adèle Adulte'), (9206, 'Max Double'), (9210, 'Lou Casting'), (9211, 'Noa Seul');
insert into public.title_credits (title_id, person_id, role, ord) values
  (tests.film(170), 9201, 'director', 0), (tests.film(171), 9201, 'cast', 0),
  (tests.film(175), 9203, 'writer', 0),
  (tests.film(200), 9204, 'cast', 0), (tests.film(199), 9205, 'cast', 0),
  (tests.film(181), 9206, 'cast', 0), (tests.film(182), 9206, 'writer', 0),
  (tests.film(190), 9211, 'cast', 0);
insert into public.title_credits (title_id, person_id, role, ord)
select tests.film(n), 9202, 'cast', 0 from generate_series(160, 169) n;
insert into public.title_credits (title_id, person_id, role, ord)
select tests.film(n), 9210, 'cast', 0 from generate_series(121, 125) n;

-- A seat's call, as that player.
create function pg_temp.skip(p_name text, p_room uuid, p_genres integer[], p_people integer[] default null,
                             p_member uuid default null) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.set_seat_skips(p_room, p_genres, p_people, p_member);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.picks(p_name text, p_room uuid, p_genres integer[]) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.set_seat_prefs(p_room, null, null, p_genres);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.read(p_name text, p_room uuid) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.room_genres(p_room);
  perform tests.clear_authentication();
  return v;
end $$;

-- A room of p_players seats, every seat on service 9001. Returns its id.
create function pg_temp.room(p_players integer, p_prefix text) returns uuid
language plpgsql as $$
declare v_room uuid; i integer;
begin
  v_room := (tests.create_room(p_players, 'quick_match', 'FR', p_prefix)->>'room_id')::uuid;
  for i in 1..p_players loop
    perform tests.authenticate_as(p_prefix || i);
    perform api.set_seat_prefs(v_room, '{9001}');
  end loop;
  perform tests.clear_authentication();
  return v_room;
end $$;

create function pg_temp.start(p_host text, p_room uuid) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_host);
  v := api.start_game(p_room);
  perform tests.clear_authentication();
  return v;
end $$;

-- A seat's own saved lists.
create function pg_temp.sg(p_name text, p_room uuid) returns integer[]
language sql as $$ select skip_genre_ids from public.room_members where id = tests.member_id(p_name, p_room) $$;
create function pg_temp.sp(p_name text, p_room uuid) returns integer[]
language sql as $$ select skip_person_ids from public.room_members where id = tests.member_id(p_name, p_room) $$;
create function pg_temp.pk(p_name text, p_room uuid) returns integer[]
language sql as $$ select genre_ids from public.room_members where id = tests.member_id(p_name, p_room) $$;

create function pg_temp.n(p_room uuid, p_event text) returns bigint
language sql as $$ select count(*) from tests.broadcasts(p_room, p_event) $$;

-- {genre_id: count} and the genre ids marked out, from a room_genres answer.
create function pg_temp.counts(p jsonb) returns jsonb
language sql as $$
  select coalesce(jsonb_object_agg(o->>'genre_id', (o->'count')::int), '{}')
  from jsonb_array_elements(p->'options') o
$$;
create function pg_temp.out_options(p jsonb) returns integer[]
language sql as $$
  select coalesce(array_agg((o->>'genre_id')::int order by (o->>'genre_id')::int), '{}')
  from jsonb_array_elements(p->'options') o where (o->>'out')::boolean
$$;
create function pg_temp.ints(p jsonb) returns integer[]
language sql as $$
  select coalesce(array_agg(x::int order by ord), '{}') from jsonb_array_elements_text(p) with ordinality t(x, ord)
$$;

-- ---------------------------------------------------------------------------------------
-- 1. The caps, repeats, null and empty lists (room c)
-- ---------------------------------------------------------------------------------------
select set_config('t.c', pg_temp.room(2, 'c')::text, true);

select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{9101,9102,9103,9104}'),
  '{"status": "too_many", "field": "genre_ids", "max": 3}'::jsonb, 'the cap: 4 genres answer too_many');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9201,9202,9210,9211}'),
  '{"status": "too_many", "field": "person_ids", "max": 3}'::jsonb, 'the cap: 4 people answer too_many');
select is((pg_temp.sg('c1', current_setting('t.c')::uuid), pg_temp.sp('c1', current_setting('t.c')::uuid)),
  ('{}'::integer[], '{}'::integer[]), 'the cap: a refused call saves nothing');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{9101,9102,9104}', '{9201,9202,9210}'),
  '{"status": "ok"}'::jsonb, '3 genres and 3 people are saved');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{9105,9101,9105}', '{9202,9201,9202}'),
  '{"status": "ok"}'::jsonb, 'a repeated genre and a repeated person are fine');
select is((pg_temp.sg('c1', current_setting('t.c')::uuid), pg_temp.sp('c1', current_setting('t.c')::uuid)),
  ('{9105,9101}'::integer[], '{9202,9201}'::integer[]), 'a repeat is kept once, in the order sent');
select pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9210}');
select is(pg_temp.sg('c1', current_setting('t.c')::uuid), '{9105,9101}'::integer[], 'a null list of genres is left as it is');
select pg_temp.skip('c1', current_setting('t.c')::uuid, '{}');
select is((pg_temp.sg('c1', current_setting('t.c')::uuid), pg_temp.sp('c1', current_setting('t.c')::uuid)),
  ('{}'::integer[], '{9210}'::integer[]), 'an empty list of genres clears the genres and leaves the people');
select pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{}');
select is(pg_temp.sp('c1', current_setting('t.c')::uuid), '{}'::integer[], 'an empty list of people clears the people');

-- ---------------------------------------------------------------------------------------
-- 2. Lobby only
-- ---------------------------------------------------------------------------------------
select set_config('t.l', pg_temp.room(2, 'l')::text, true);
select is(pg_temp.skip('l1', current_setting('t.l')::uuid, '{9101}')->>'status', 'ok', 'premise: the lobby takes a skip');
update public.rooms set state = 'dealing' where id = current_setting('t.l')::uuid;
select is(pg_temp.skip('l1', current_setting('t.l')::uuid, '{9102}')->>'status', 'locked', 'dealing answers locked');
update public.rooms set state = 'swiping' where id = current_setting('t.l')::uuid;
select is(pg_temp.skip('l1', current_setting('t.l')::uuid, '{9102}')->>'status', 'locked', 'swiping answers locked');
update public.rooms set state = 'finale' where id = current_setting('t.l')::uuid;
select is(pg_temp.skip('l1', current_setting('t.l')::uuid, '{9102}')->>'status', 'locked', 'the finale answers locked');
select is(pg_temp.sg('l1', current_setting('t.l')::uuid), '{9101}'::integer[], 'a locked call saves nothing');
update public.rooms set state = 'done' where id = current_setting('t.l')::uuid;
select is(pg_temp.skip('l1', current_setting('t.l')::uuid, '{9102}')->>'status', 'closed', 'a finished room answers closed');
update public.rooms set state = 'abandoned' where id = current_setting('t.l')::uuid;
select is(pg_temp.skip('l1', current_setting('t.l')::uuid, '{9102}')->>'status', 'closed', 'an abandoned room answers closed');
select is(pg_temp.skip('l1', gen_random_uuid(), '{9102}')->>'status', 'closed', 'an unknown room answers closed');

-- A solo room has no lobby.
select tests.create_player('solo1');
with r as (
  insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, state)
  values (internal.new_room_code(), tests.uid('solo1'), 'solo', 'FR', 1, 'hide_seen', 'swiping')
  returning id)
insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key)
select r.id, tests.uid('solo1'), tests.uid('solo1'), 'host', 'solo1', 'fox' from r;
select is(pg_temp.skip('solo1', (select id from public.rooms where host_id = tests.uid('solo1')), '{9101}')->>'status', 'locked',
  'a solo room answers locked');

-- ---------------------------------------------------------------------------------------
-- 3. Who can call
-- ---------------------------------------------------------------------------------------
select set_config('t.w', pg_temp.room(2, 'w')::text, true);
select tests.create_player('stranger');
select throws_ok($$ select pg_temp.skip('stranger', current_setting('t.w')::uuid, '{9101}') $$, '42501', null,
  'a player without a seat gets 42501');
select throws_ok($$ select pg_temp.skip('w1', current_setting('t.w')::uuid, '{9101}', null, tests.member_id('w2', current_setting('t.w')::uuid)) $$,
  '42501', null, 'a seat the caller does not control gets 42501');
select is(pg_temp.sg('w2', current_setting('t.w')::uuid), '{}'::integer[], 'the refused call saved nothing');
insert into public.room_members (id, room_id, profile_id, controlled_by, role, display_name, avatar_key)
values ('00000000-0000-4000-8000-0000000000d1', current_setting('t.w')::uuid, null, tests.uid('w1'), 'guest', 'Kid', 'a1');
select is(pg_temp.skip('w1', current_setting('t.w')::uuid, '{9101}', '{9201}', '00000000-0000-4000-8000-0000000000d1'),
  '{"status": "ok"}'::jsonb, 'a pass-and-play seat the caller controls works');
select is((select skip_genre_ids from public.room_members where id = '00000000-0000-4000-8000-0000000000d1'), '{9101}'::integer[],
  'the controlled seat holds the skip');
select is(pg_temp.sg('w1', current_setting('t.w')::uuid), '{}'::integer[], 'the caller''s own seat is untouched');

-- ---------------------------------------------------------------------------------------
-- 4. Which genres and people
-- ---------------------------------------------------------------------------------------
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{9199}')->>'status', 'unknown_genre', 'a TV-only genre answers unknown_genre');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{9101,null}')->>'status', 'unknown_genre', 'a null genre answers unknown_genre');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{123456}')->>'status', 'unknown_genre', 'an id that is no genre answers unknown_genre');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, '{9103}')->>'status', 'ok', 'a genre not offered tonight (under 30 films) is accepted');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9203}')->>'status', 'unknown_person', 'a writer-only person answers unknown_person');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9204}')->>'status', 'unknown_person', 'a person only in an inactive film answers unknown_person');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9205}')->>'status', 'unknown_person', 'a person only in an adult film answers unknown_person');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{999999}')->>'status', 'unknown_person', 'a made-up person answers unknown_person');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9201,null}')->>'status', 'unknown_person', 'a null person answers unknown_person');
select is(pg_temp.skip('c1', current_setting('t.c')::uuid, null, '{9206}')->>'status', 'ok', 'a person with a cast credit and a writer credit is accepted');
select is(pg_temp.sg('c1', current_setting('t.c')::uuid), '{9103}'::integer[], 'a refused call left the earlier genres alone');

-- ---------------------------------------------------------------------------------------
-- 5. The room limit: 4 genres out tonight
-- ---------------------------------------------------------------------------------------
select set_config('t.m', pg_temp.room(3, 'm')::text, true);
select pg_temp.skip('m1', current_setting('t.m')::uuid, '{9101,9102,9103}');
select pg_temp.skip('m2', current_setting('t.m')::uuid, '{9104}');
select is(pg_temp.skip('m3', current_setting('t.m')::uuid, '{9105}'), '{"status": "room_limit", "max": 4}'::jsonb,
  'a fifth new genre answers room_limit with max 4');
select is(pg_temp.sg('m3', current_setting('t.m')::uuid), '{}'::integer[], 'a refused fifth genre saves nothing');
select is(pg_temp.skip('m3', current_setting('t.m')::uuid, '{9101}')->>'status', 'ok', 'skipping one of the 4 genres already out works');
select is(pg_temp.skip('m2', current_setting('t.m')::uuid, '{9105}')->>'status', 'ok',
  'replacing one''s own skip with a new genre works when the total stays 4');
select is(pg_temp.skip('m2', current_setting('t.m')::uuid, '{9104}')->>'status', 'ok', 'and so does swapping back');
select is(pg_temp.skip('m3', current_setting('t.m')::uuid, '{9101,9104}')->>'status', 'ok', 'a second genre already out works too');
select is(pg_temp.skip('m3', current_setting('t.m')::uuid, '{9101,9104}', '{9201,9202,9210}')->>'status', 'ok',
  'people have no room limit');

select set_config('t.n', pg_temp.room(3, 'n')::text, true);
select pg_temp.skip('n1', current_setting('t.n')::uuid, '{9101,9102,9103}');
select pg_temp.skip('n2', current_setting('t.n')::uuid, '{9104}');
select tests.authenticate_as('n2');
select api.leave_room(current_setting('t.n')::uuid);
select tests.clear_authentication();
select is(pg_temp.skip('n3', current_setting('t.n')::uuid, '{9105}')->>'status', 'ok',
  'a seat that left does not count toward the room limit');

select set_config('t.v', pg_temp.room(3, 'v')::text, true);
select pg_temp.skip('v1', current_setting('t.v')::uuid, '{9101,9102,9103}');
select pg_temp.skip('v2', current_setting('t.v')::uuid, '{9104}');
select is(pg_temp.skip('v3', current_setting('t.v')::uuid, '{9105}')->>'status', 'room_limit', 'premise: 4 genres are out');
select tests.authenticate_as('v1');
select api.remove_member(current_setting('t.v')::uuid, tests.member_id('v2', current_setting('t.v')::uuid));
select tests.clear_authentication();
select is(pg_temp.skip('v3', current_setting('t.v')::uuid, '{9105}')->>'status', 'ok',
  'a removed seat does not count toward the room limit');

-- ---------------------------------------------------------------------------------------
-- 6 and 7. A skip takes the genre off every seat's picks; a genre out can't be picked
-- ---------------------------------------------------------------------------------------
select set_config('t.k', pg_temp.room(3, 'k')::text, true);
select pg_temp.picks('k1', current_setting('t.k')::uuid, '{9101,9102}');
select pg_temp.picks('k2', current_setting('t.k')::uuid, '{9101}');
select pg_temp.picks('k3', current_setting('t.k')::uuid, '{9104}');
select is(pg_temp.counts(pg_temp.read('k3', current_setting('t.k')::uuid))->>'9101', '2', 'premise: two seats picked 9101');
select is(pg_temp.skip('k2', current_setting('t.k')::uuid, '{9101}')->>'status', 'ok', 'k2 skips 9101');
select is((pg_temp.pk('k1', current_setting('t.k')::uuid), pg_temp.pk('k2', current_setting('t.k')::uuid), pg_temp.pk('k3', current_setting('t.k')::uuid)),
  ('{9102}'::integer[], '{}'::integer[], '{9104}'::integer[]),
  'the skip took 9101 off every seat''s picks, the skipper''s own included, and left the others');
select is(pg_temp.counts(pg_temp.read('k3', current_setting('t.k')::uuid))->>'9101', '0', 'the count of the skipped genre dropped');
select is(pg_temp.picks('k1', current_setting('t.k')::uuid, '{9101}')->>'status', 'out_tonight', 'picking a genre another seat skipped answers out_tonight');
select is(pg_temp.picks('k2', current_setting('t.k')::uuid, '{9101}')->>'status', 'out_tonight', 'picking one''s own skipped genre answers out_tonight');
select is(pg_temp.pk('k1', current_setting('t.k')::uuid), '{9102}'::integer[], 'a refused pick saves nothing');
select pg_temp.skip('k2', current_setting('t.k')::uuid, '{}');
select is((pg_temp.pk('k1', current_setting('t.k')::uuid), pg_temp.pk('k2', current_setting('t.k')::uuid)),
  ('{9102}'::integer[], '{}'::integer[]), 'lifting the skip brings no pick back');
select is(pg_temp.picks('k1', current_setting('t.k')::uuid, '{9101,9102}')->>'status', 'ok', 'once lifted, the genre can be picked again');

-- ---------------------------------------------------------------------------------------
-- 8. room_genres: out, options, skips, never who
-- ---------------------------------------------------------------------------------------
select set_config('t.g', pg_temp.room(3, 'g')::text, true);
select pg_temp.skip('g2', current_setting('t.g')::uuid, '{9101,9103}', '{9201}');

select is(pg_temp.ints(pg_temp.read('g1', current_setting('t.g')::uuid)->'out'), '{9101,9103}'::integer[],
  'another seat sees the genres skipped by others in out');
select is((select o from jsonb_array_elements(pg_temp.read('g1', current_setting('t.g')::uuid)->'options') o where o->>'genre_id' = '9101'),
  '{"genre_id": 9101, "count": 0, "out": true}'::jsonb, 'an out genre stays in options with count 0 and out true');
select is((select count(*) from jsonb_array_elements(pg_temp.read('g1', current_setting('t.g')::uuid)->'options') o where o->>'genre_id' = '9103'),
  0::bigint, 'a skipped genre not offered tonight is in out only');
select is((select o from jsonb_array_elements(pg_temp.read('g1', current_setting('t.g')::uuid)->'options') o where o->>'genre_id' = '9102'),
  '{"genre_id": 9102, "count": 0}'::jsonb, 'a genre that is not out keeps its plain option');
select is(pg_temp.read('g2', current_setting('t.g')::uuid)->'skips'->'genre_ids', '[9101, 9103]'::jsonb,
  'the skipper sees their own skips, in the order added');
select is(pg_temp.read('g2', current_setting('t.g')::uuid)->'skips'->'people', '[{"id": 9201, "name": "Dora Directrice"}]'::jsonb,
  'the skipper sees their own people with id and name only');
select is(pg_temp.ints(pg_temp.read('g2', current_setting('t.g')::uuid)->'out'), '{}'::integer[],
  'the skipper''s own skips are not in out when nobody else skipped them');
select is(pg_temp.out_options(pg_temp.read('g2', current_setting('t.g')::uuid)), '{9101}'::integer[],
  'but the skipper''s own skipped genre is an out option');
select pg_temp.skip('g3', current_setting('t.g')::uuid, '{9101}');
select is(pg_temp.ints(pg_temp.read('g2', current_setting('t.g')::uuid)->'out'), '{9101}'::integer[],
  'with another seat also skipping it, the genre is in the skipper''s out');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.read('g1', current_setting('t.g')::uuid)) k),
  '{mine,options,out,skips,status}'::text[], 'room_genres answers exactly status, options, mine, out and skips');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.read('g2', current_setting('t.g')::uuid)->'skips') k),
  '{genre_ids,people}'::text[], 'skips holds exactly genre_ids and people');
select is(pg_temp.read('g1', current_setting('t.g')::uuid)->'skips', '{"genre_ids": [], "people": []}'::jsonb,
  'another seat''s skips never hold the others'' genres or people');
select is((select count(*) from public.room_members m
           where m.room_id = current_setting('t.g')::uuid
             and (pg_temp.read('g1', current_setting('t.g')::uuid)::text like '%' || m.id || '%'
               or pg_temp.read('g1', current_setting('t.g')::uuid)::text like '%' || m.profile_id || '%'
               or pg_temp.read('g1', current_setting('t.g')::uuid)::text like '%"' || m.display_name || '"%'
               or pg_temp.read('g3', current_setting('t.g')::uuid)::text like '%' || m.id || '%'
               or pg_temp.read('g3', current_setting('t.g')::uuid)::text like '%"' || m.display_name || '"%')),
  0::bigint, 'no seat id, profile id or name appears in the answers');
select is(position('Dora' in pg_temp.read('g1', current_setting('t.g')::uuid)::text) + position('9201' in pg_temp.read('g3', current_setting('t.g')::uuid)::text),
  0, 'no other seat''s answer holds the skipped person');

-- ---------------------------------------------------------------------------------------
-- 9. Broadcasts: genres_changed, empty, no seat
-- ---------------------------------------------------------------------------------------
select set_config('t.b', pg_temp.room(3, 'b')::text, true);
select set_config('t.b_seat', pg_temp.n(current_setting('t.b')::uuid, 'seat_updated')::text, true);
select pg_temp.skip('b1', current_setting('t.b')::uuid, '{9101}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), 1::bigint, 'a skip that changes the out list sends one genres_changed');
select is((select count(*) from tests.broadcasts(current_setting('t.b')::uuid, 'genres_changed') p where p - 'id' <> '{}'::jsonb),
  0::bigint, 'genres_changed carries an empty payload');
select pg_temp.skip('b1', current_setting('t.b')::uuid, '{9101}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), 1::bigint, 'a repeat sends nothing');
select pg_temp.skip('b1', current_setting('t.b')::uuid, null, '{9201,9202}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), 1::bigint, 'a people-only change sends nothing');
select pg_temp.skip('b2', current_setting('t.b')::uuid, '{9101}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), 1::bigint, 'a skip of a genre already out, with no pick on it, sends nothing');
select pg_temp.skip('b1', current_setting('t.b')::uuid, '{}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), 1::bigint, 'lifting a skip another seat still holds sends nothing');
select pg_temp.skip('b2', current_setting('t.b')::uuid, '{}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), 2::bigint, 'lifting the last skip of a genre sends genres_changed');
select pg_temp.picks('b3', current_setting('t.b')::uuid, '{9104}');
select set_config('t.b_picks', pg_temp.n(current_setting('t.b')::uuid, 'genres_changed')::text, true);
select pg_temp.skip('b3', current_setting('t.b')::uuid, '{9104}');
select is(pg_temp.n(current_setting('t.b')::uuid, 'genres_changed'), current_setting('t.b_picks')::bigint + 1,
  'a skip that takes a pick away sends genres_changed');
select is(pg_temp.n(current_setting('t.b')::uuid, 'seat_updated')::text, current_setting('t.b_seat'),
  'a skip never sends seat_updated, which would name the seat');

-- ---------------------------------------------------------------------------------------
-- 10, 11, 15. Start copies the skips of every seat still in the room
-- ---------------------------------------------------------------------------------------
-- s1 and s2 are present; s3 is away (not left); s4 skipped and left.
select set_config('t.s', pg_temp.room(4, 's')::text, true);
select pg_temp.skip('s1', current_setting('t.s')::uuid, '{9101}', '{9201}');
select pg_temp.skip('s2', current_setting('t.s')::uuid, '{9102}', '{9206}');
select pg_temp.skip('s3', current_setting('t.s')::uuid, '{9104}', '{9202}');
select pg_temp.skip('s4', current_setting('t.s')::uuid, '{9105}', '{9211}');
update public.room_members set last_active_at = now() - interval '10 minutes' where id = tests.member_id('s3', current_setting('t.s')::uuid);
select tests.authenticate_as('s4');
select api.leave_room(current_setting('t.s')::uuid);
select tests.clear_authentication();
select is((select dropped_genre_ids from public.room_models where room_id = current_setting('t.s')::uuid), '{}'::integer[],
  'premise: nothing is dropped in the lobby');

select is(pg_temp.start('s1', current_setting('t.s')::uuid)->>'status', 'ok', 'premise: the game starts');
select is((select dropped_genre_ids from public.room_models where room_id = current_setting('t.s')::uuid), '{9101,9102,9104}'::integer[],
  'Start drops the sorted union of the skipped genres of present and away seats, not the seat that left');
select is((select dropped_person_ids from public.room_models where room_id = current_setting('t.s')::uuid), '{9201,9202,9206}'::integer[],
  'Start drops the sorted union of the skipped people, not the seat that left');
select is((select count(*) from public.deck_entries d join public.titles t on t.id = d.title_id
           where d.room_id = current_setting('t.s')::uuid and t.genre_ids && '{9101,9102,9104}'),
  0::bigint, 'no dealt card has a skipped genre');
select is((select count(*) from public.deck_entries d join public.title_credits c on c.title_id = d.title_id
           where d.room_id = current_setting('t.s')::uuid and c.person_id in (9201, 9202, 9206) and c.role in ('director', 'cast')),
  0::bigint, 'no dealt card has a skipped person as director or cast');
select is((select count(*) > 0 from public.deck_entries d where d.room_id = current_setting('t.s')::uuid), true,
  'premise: cards were dealt');
select is((select count(*) from internal.eligible_titles(current_setting('t.s')::uuid, true) e where e.id = tests.film(182)), 1::bigint,
  'a film where the skipped person is only a writer is still eligible');
select is((select count(*) from internal.eligible_titles(current_setting('t.s')::uuid, true) e where e.id = tests.film(181)), 0::bigint,
  'a film where the skipped person has a cast credit is not eligible');

select tests.create_player('late');
select set_config('t.s_code', (select code from public.rooms where id = current_setting('t.s')::uuid), true);
select tests.authenticate_as('late');
select set_config('t.late_join', api.join_room(current_setting('t.s_code'))::text, true);
select tests.clear_authentication();
select is(current_setting('t.late_join')::jsonb->>'status', 'ok', 'premise: the late joiner is seated');
select is(pg_temp.skip('late', current_setting('t.s')::uuid, '{9105}')->>'status', 'locked', 'a late joiner can''t skip');
select set_config('tests.room_id', current_setting('t.s'), true);
select tests.vote_next('s1', 20);
select is((select count(*) from public.deck_entries d
           join public.titles t on t.id = d.title_id
           where d.room_id = current_setting('t.s')::uuid
             and (t.genre_ids && '{9101,9102,9104}'
               or exists (select 1 from public.title_credits c where c.title_id = d.title_id
                          and c.person_id in (9201, 9202, 9206) and c.role in ('director', 'cast')))),
  0::bigint, 'after a refill and a late joiner, no dealt card is a skipped one');
select is((select count(*) > 0 from public.deck_entries d where d.room_member_id = tests.member_id('late', current_setting('t.s')::uuid)),
  true, 'the late joiner has a deck');

-- After Start, out is every dropped genre, whoever skipped it.
select is(pg_temp.ints(pg_temp.read('s1', current_setting('t.s')::uuid)->'out'), '{9101,9102,9104}'::integer[],
  'after Start, out holds every dropped genre');

-- A seat that rejoins before Start counts again.
select set_config('t.j', pg_temp.room(3, 'j')::text, true);
select pg_temp.skip('j3', current_setting('t.j')::uuid, '{9104}', '{9210}');
select tests.authenticate_as('j3');
select api.leave_room(current_setting('t.j')::uuid);
select tests.clear_authentication();
select set_config('t.j_code', (select code from public.rooms where id = current_setting('t.j')::uuid), true);
select tests.authenticate_as('j3');
select api.join_room(current_setting('t.j_code'));
select tests.clear_authentication();
select is(pg_temp.start('j1', current_setting('t.j')::uuid)->>'status', 'ok', 'premise: the rejoin game starts');
select is((select (dropped_genre_ids, dropped_person_ids) from public.room_models where room_id = current_setting('t.j')::uuid),
  ('{9104}'::integer[], '{9210}'::integer[]), 'a seat that rejoins before Start counts again');

-- ---------------------------------------------------------------------------------------
-- 12. The offer is counted after the skips at Start
-- ---------------------------------------------------------------------------------------
select set_config('t.u', pg_temp.room(2, 'u')::text, true);
select pg_temp.picks('u1', current_setting('t.u')::uuid, '{9105}');
select pg_temp.picks('u2', current_setting('t.u')::uuid, '{9101}');
select is(pg_temp.counts(pg_temp.read('u1', current_setting('t.u')::uuid))->>'9105', '1', 'premise: 9105 has exactly 30 films and is offered in the lobby');
select pg_temp.skip('u1', current_setting('t.u')::uuid, null, '{9210}');
select is(pg_temp.counts(pg_temp.read('u1', current_setting('t.u')::uuid))->>'9105', '1', 'a skipped person does not change the lobby''s offer');
select is(pg_temp.start('u1', current_setting('t.u')::uuid)->>'status', 'ok', 'premise: the game starts');
select is((select genre_picks from public.room_models where room_id = current_setting('t.u')::uuid), '[[9101]]'::jsonb,
  'a pick left under 30 films by the skips is left out of genre_picks');

-- ---------------------------------------------------------------------------------------
-- 13. Skips leaving under 20 films
-- ---------------------------------------------------------------------------------------
select set_config('t.t', pg_temp.room(2, 't')::text, true);
select pg_temp.skip('t1', current_setting('t.t')::uuid, '{9106}', '{9201}');
select set_config('t.t_before', (pg_temp.read('t2', current_setting('t.t')::uuid)->'options')::text, true);
select set_config('t.t_answer', pg_temp.start('t1', current_setting('t.t')::uuid)::text, true);
select is(current_setting('t.t_answer')::jsonb->>'status', 'too_few_films', 'skips leaving under 20 films answer too_few_films');
select cmp_ok((current_setting('t.t_answer')::jsonb->>'eligible')::int, '<', 20, 'the answer carries the number of eligible films');
select is((select state::text from public.rooms where id = current_setting('t.t')::uuid), 'lobby', 'the room is back in the lobby');
select is((select (dropped_genre_ids, dropped_person_ids) from public.room_models where room_id = current_setting('t.t')::uuid),
  ('{}'::integer[], '{}'::integer[]), 'the room''s copy of the skips is cleared');
select is((pg_temp.sg('t1', current_setting('t.t')::uuid), pg_temp.sp('t1', current_setting('t.t')::uuid)),
  ('{9106}'::integer[], '{9201}'::integer[]), 'the seat keeps its skips');
select is((pg_temp.read('t2', current_setting('t.t')::uuid)->'options')::text, current_setting('t.t_before'),
  'the lobby''s options are what they were before Start');
select pg_temp.skip('t1', current_setting('t.t')::uuid, '{}');
select is(pg_temp.start('t1', current_setting('t.t')::uuid)->>'status', 'ok', 'a second Start with fewer skips deals');
select is((select (dropped_genre_ids, dropped_person_ids) from public.room_models where room_id = current_setting('t.t')::uuid),
  ('{}'::integer[], '{9201}'::integer[]), 'and rewrites both columns from the seats');

-- ---------------------------------------------------------------------------------------
-- 14. With no skips anywhere, the deal is exactly today's
-- ---------------------------------------------------------------------------------------
select set_config('t.z', pg_temp.room(2, 'z')::text, true);
update public.rooms set seed = 7 where id = current_setting('t.z')::uuid;
create temp table today_order as
  select array_agg(c.title_id order by internal.shuffle_key(7, c.title_id, c.group_score) desc, c.title_id) as ids
  from internal.deck_candidates(current_setting('t.z')::uuid, 300, 1.0) c;
select is(pg_temp.start('z1', current_setting('t.z')::uuid)->>'status', 'ok', 'premise: the no-skips game starts');
select is(tests.upcoming('z1', current_setting('t.z')::uuid), (select ids[1:25] from today_order),
  'no skips: the deck is today''s weighted shuffle, card for card');
select is((select (dropped_genre_ids, dropped_person_ids) from public.room_models where room_id = current_setting('t.z')::uuid),
  ('{}'::integer[], '{}'::integer[]), 'no skips: nothing is dropped');

select * from finish();
rollback;

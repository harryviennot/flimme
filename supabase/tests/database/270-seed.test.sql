-- The synthetic seed (roadmap task M1.14, supabase/seed.sql): a game can be played
-- on it, every filter finds films, nothing in it can be TMDB data or clash with
-- the test fixtures. The file runs on the loaded seed, so it only reads it. The
-- rooms it makes are rolled back with the test.

begin;
select plan(24);

-- S1: the films are watchable in France on the seed services.
select cmp_ok(
  (select count(*) from public.titles t
   where t.media_type = 'movie' and t.is_active and not t.is_adult
     and exists (select 1 from public.title_availability a
                 where a.title_id = t.id and a.country = 'FR'
                   and a.provider_id between 8001 and 8010
                   and a.kind in ('subscription', 'free', 'ads'))
     and exists (select 1 from public.title_certifications c
                 where c.title_id = t.id and c.country = 'FR' and c.min_age is not null)),
  '>=', 500::bigint,
  'S1 at least 500 films are watchable in FR on the seed services');
select is((select catalog_enabled from public.countries where code = 'FR'), true,
  'S1 France is a catalog country');
select cmp_ok((select count(*) from public.provider_regions where country = 'FR' and provider_id between 8001 and 8010),
  '=', 10::bigint, 'S1 the 10 seed services are listed in FR');

-- S2: a 4-seat room on two seed services is dealt 30 cards to every seat.
select tests.create_room(4, 'quick_match', 'FR', 's');
select tests.authenticate_as('s1');
select api.set_seat_prefs(tests.room_id(), array[8001]);
select tests.authenticate_as('s2');
select api.set_seat_prefs(tests.room_id(), array[8001]);
select tests.authenticate_as('s3');
select api.set_seat_prefs(tests.room_id(), array[8002]);
select tests.authenticate_as('s4');
select api.set_seat_prefs(tests.room_id(), array[8002]);
select tests.authenticate_as('s1');
select api.start_game(tests.room_id());
select tests.clear_authentication();
-- While the server deals the start, a second tap after 8 seconds deals the SQL baseline.
update public.rooms set dealing_at = now() - interval '9 seconds'
where id = tests.room_id() and state = 'dealing';
select tests.authenticate_as('s1');
select api.start_game(tests.room_id())
where (select state from public.rooms where id = tests.room_id()) = 'dealing';
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'swiping',
  'S2 the room is swiping after the deal');
select is((select count(*) from public.room_cards where room_id = tests.room_id()), 30::bigint,
  'S2 the room is dealt 30 cards');
select is(
  (select array_agg(n) from (select count(*) as n from public.deck_entries
                             where room_id = tests.room_id() group by room_member_id) x),
  array[30::bigint, 30, 30, 30],
  'S2 every seat has 30 cards');
select ok(
  (select bool_and(exists (select 1 from public.title_availability a
                           where a.title_id = c.title_id and a.country = 'FR' and a.provider_id in (8001, 8002)))
   from public.room_cards c where c.room_id = tests.room_id()),
  'S2 every dealt film is on one of the two services');

-- S3: every filter finds 40 films or more. Deck candidates are read the way the
-- deal reads them, on a room that has every seed service, the default offer kinds
-- and the setting under test (no misery line, so only the filters count).
select tests.create_room(2, 'quick_match', 'FR', 'q');
create function pg_temp.found(p_quality text, p_max_age integer, p_runtime_max integer) returns bigint
language plpgsql
as $$
begin
  update public.rooms
  set quality = p_quality::public.quality_preset, max_age = p_max_age, runtime_max = p_runtime_max,
      provider_ids = array(select generate_series(8001, 8010))
  where id = tests.room_id();
  return (select count(*) from internal.deck_candidates(tests.room_id(), 500, 0));
end
$$;
select cmp_ok(pg_temp.found('standard', null, null), '>=', 40::bigint, 'S3 the standard preset finds 40 films or more');
select cmp_ok(pg_temp.found('hidden_gems', null, null), '>=', 40::bigint, 'S3 the hidden gems preset finds 40 films or more');
select cmp_ok(pg_temp.found('guilty_pleasures', null, null), '>=', 40::bigint, 'S3 the guilty pleasures preset finds 40 films or more');
select cmp_ok(pg_temp.found('standard', 16, null), '>=', 40::bigint, 'S3 an age cap of 16 finds 40 films or more');
select cmp_ok(pg_temp.found('standard', 12, null), '>=', 40::bigint, 'S3 an age cap of 12 finds 40 films or more');
select cmp_ok(pg_temp.found('standard', 10, null), '>=', 40::bigint, 'S3 an age cap of 10 finds 40 films or more');
select cmp_ok(pg_temp.found('standard', 0, null), '>=', 40::bigint, 'S3 an age cap of 0 (all ages) finds 40 films or more');
select cmp_ok(pg_temp.found('standard', null, 105), '>=', 40::bigint, 'S3 the 105-minute budget finds 40 films or more');

-- S4: every default offer kind and every service has films.
select cmp_ok(
  (select min(n) from (select count(distinct a.title_id) as n from public.title_availability a
                       where a.kind in ('subscription', 'free', 'ads') group by a.kind) x),
  '>=', 40::bigint, 'S4 each of subscription, free and ads has 40 films or more');
select cmp_ok(
  (select min(n) from (select count(*) as n from public.title_availability a
                       join public.providers p on p.id = a.provider_id
                       where a.country = 'FR' group by p.id) x),
  '>=', 40::bigint, 'S4 every seed service has 40 offers or more');
select is((select count(distinct a.provider_id) from public.title_availability a), 10::bigint,
  'S4 all 10 services have availability');

-- S5: nothing in the seed is in a fixture id range, or can be TMDB data.
select is((select count(*) from public.titles where tmdb_id < 50000000), 0::bigint,
  'S5 every seed film has a tmdb_id from 50,000,000 (fixtures use 1,000,000 to 17,777,215)');
select is((select count(*) from public.providers where id not between 8001 and 8010), 0::bigint,
  'S5 every seed service is 8001 to 8010 (fixtures use 9001 and up)');
select is((select count(*) from public.genres where id not between 7001 and 7012), 0::bigint,
  'S5 every seed genre is 7001 to 7012');
select is((select count(*) from public.titles where poster_path is not null or backdrop_path is not null), 0::bigint,
  'S5 no film has a poster or a backdrop path');

-- S6: every film has French and English text, a vector and a French certification.
select is(
  (select count(*) from public.titles t
   where not exists (select 1 from public.title_translations x
                     where x.title_id = t.id and x.language = 'fr' and x.title <> '' and x.overview <> '')
      or not exists (select 1 from public.title_translations x
                     where x.title_id = t.id and x.language = 'en' and x.title <> '' and x.overview <> '')),
  0::bigint, 'S6 every film has a French and an English title and synopsis');
select is(
  (select count(*) from public.titles t
   where not exists (select 1 from public.title_vectors v where v.title_id = t.id)),
  0::bigint, 'S6 every film has a placeholder vector (the SQL deal needs one)');

select * from finish();
rollback;

-- M6.53: per-player genres (game-modes.md#genres-tonight, deck-engine.md#per-player-genres).
-- Each seat picks up to 3 TMDB movie genres in the lobby (never TV Movie, never a genre with
-- under 30 eligible films tonight). Others see counts, never who picked what. Picks lock at
-- Start. The deal draws about 3 cards in 4 from films matching a pick, by
-- score + 0.3 x ln(weight), where the weight is the share of picking seats a film matches;
-- the other slots follow today's order. A pick pool under 100 films gets a smaller share.
-- With no picks, the deck is exactly today's.

begin;
select plan(53);

select tests.use_deck_engine('sql');
select tests.create_catalog(200);

-- Made-up genres. 9101: films 1 to 100. 9102: films 51 to 150. 9103: films 1 to 29 (under 30,
-- not offered). 9104: films 151 to 190 (40 films, a pool under the guard). 9105: films 1 to 30
-- (exactly 30, offered). TV Movie (10770): every film, never offered.
insert into public.genres (id, slug, names) values
  (9101, 'test_alpha', '{"en": "Alpha", "fr": "Alpha"}'),
  (9102, 'test_beta', '{"en": "Beta", "fr": "Bêta"}'),
  (9103, 'test_gamma', '{"en": "Gamma", "fr": "Gamma"}'),
  (9104, 'test_delta', '{"en": "Delta", "fr": "Delta"}'),
  (9105, 'test_epsilon', '{"en": "Epsilon", "fr": "Epsilon"}')
on conflict do nothing;
insert into public.genres (id, slug, names) values (10770, 'tv_movie', '{"en": "TV Movie", "fr": "Téléfilm"}')
on conflict do nothing;

update public.titles t set genre_ids = array_remove(array[
    case when n between 1 and 100 then 9101 end,
    case when n between 51 and 150 then 9102 end,
    case when n between 1 and 29 then 9103 end,
    case when n between 151 and 190 then 9104 end,
    case when n between 1 and 30 then 9105 end,
    10770], null)
from generate_series(1, 200) n
where t.id = tests.film(n);

-- A seat's call, as that player.
create function pg_temp.genres(p_name text, p_room uuid, p_genres integer[]) returns jsonb
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

-- {genre_id: count} from a room_genres answer.
create function pg_temp.counts(p jsonb) returns jsonb
language sql as $$
  select coalesce(jsonb_object_agg(o->>'genre_id', (o->'count')::int), '{}')
  from jsonb_array_elements(p->'options') o
$$;

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

create function pg_temp.start(p_host text, p_room uuid) returns text
language plpgsql as $$
declare v text;
begin
  perform tests.authenticate_as(p_host);
  v := api.start_game(p_room)->>'status';
  perform tests.clear_authentication();
  return v;
end $$;

-- Is this deck position (1, 2, ...) a pick slot, for this share? The simulation's slot pattern:
-- a running total starts at a half and gains the share at each position; a pick slot when it
-- passes a whole number.
create function pg_temp.is_pick(p_pos integer, p_share real) returns boolean
language sql as $$
  select floor(0.5 + p_pos * round(p_share::numeric, 4)) > floor(0.5 + (p_pos - 1) * round(p_share::numeric, 4))
$$;

-- A seat's whole deck in position order, with each film's weight and both shuffle keys.
create function pg_temp.deck(p_name text, p_room uuid)
returns table (pos integer, title_id bigint, w real, k double precision, kp double precision)
language sql as $$
  select (row_number() over (order by d.sort_key))::int, d.title_id,
         internal.pick_weight(t.genre_ids, rm.genre_picks),
         internal.shuffle_key(r.seed, d.title_id, rc.group_score),
         case when internal.pick_weight(t.genre_ids, rm.genre_picks) > 0
           then internal.shuffle_key(r.seed, d.title_id,
                  (rc.group_score + 0.3 * ln(internal.pick_weight(t.genre_ids, rm.genre_picks)))::real) end
  from public.deck_entries d
  join public.titles t on t.id = d.title_id
  join public.room_cards rc on rc.room_id = d.room_id and rc.title_id = d.title_id
  join public.rooms r on r.id = d.room_id
  join public.room_models rm on rm.room_id = d.room_id
  where d.room_member_id = tests.member_id(p_name, p_room)
  order by d.sort_key
$$;

-- ---------------------------------------------------------------------------------------
-- The lobby: what is offered, the cap, counts only
-- ---------------------------------------------------------------------------------------
select set_config('t.a', pg_temp.room(3, 'a')::text, true);
select tests.create_player('stranger');

select is((select jsonb_agg(o->'genre_id') from jsonb_array_elements(pg_temp.read('a1', current_setting('t.a')::uuid)->'options') o)
            @> '[9101, 9102, 9104, 9105]'::jsonb, true,
  'genres with 30 eligible films or more are offered');
select is(pg_temp.counts(pg_temp.read('a1', current_setting('t.a')::uuid)) ? '9103', false,
  'a genre with 29 eligible films is not offered');
select is(pg_temp.counts(pg_temp.read('a1', current_setting('t.a')::uuid)) ? '10770', false,
  'TV Movie is never offered');
select is((select array_agg((o->>'genre_id')::int order by ord) from jsonb_array_elements(pg_temp.read('a1', current_setting('t.a')::uuid)->'options') with ordinality x(o, ord)),
          (select array_agg((o->>'genre_id')::int order by (o->>'genre_id')::int) from jsonb_array_elements(pg_temp.read('a1', current_setting('t.a')::uuid)->'options') o),
  'options come in api.genres order (by genre id)');
select is(pg_temp.counts(pg_temp.read('a1', current_setting('t.a')::uuid))->>'9101', '0',
  'before any pick, every offered genre counts 0');

select is(pg_temp.genres('a1', current_setting('t.a')::uuid, '{9101,9102,9104,9105}'),
  '{"status": "too_many", "field": "genre_ids", "max": 3}'::jsonb,
  'the cap: more than 3 genres is refused');
select is((select genre_ids from public.room_members where id = tests.member_id('a1', current_setting('t.a')::uuid)), '{}'::integer[],
  'the cap: a refused call saves nothing');
select is(pg_temp.genres('a1', current_setting('t.a')::uuid, '{9101,9103}')->>'status', 'unknown_genre',
  'a genre that is not offered tonight answers unknown_genre');
select is(pg_temp.genres('a1', current_setting('t.a')::uuid, '{10770}')->>'status', 'unknown_genre',
  'TV Movie answers unknown_genre');
select is(pg_temp.genres('a1', current_setting('t.a')::uuid, '{123456}')->>'status', 'unknown_genre',
  'an id that is no genre answers unknown_genre');

select is(pg_temp.genres('a1', current_setting('t.a')::uuid, '{9101,9102,9105}'), '{"status": "ok"}'::jsonb,
  '3 offered genres are saved');
select is(pg_temp.genres('a2', current_setting('t.a')::uuid, '{9101,9101}')->>'status', 'ok',
  'a repeated genre is fine');
select is((select genre_ids from public.room_members where id = tests.member_id('a2', current_setting('t.a')::uuid)), '{9101}'::integer[],
  'a repeated genre is saved once');

select is((select jsonb_object_agg(k, v) from jsonb_each(pg_temp.counts(pg_temp.read('a3', current_setting('t.a')::uuid))) x(k, v)
           where k in ('9101', '9102', '9104', '9105')),
  '{"9101": 2, "9102": 1, "9104": 0, "9105": 1}'::jsonb,
  'counts are the number of seats that picked each genre');
select is(pg_temp.read('a1', current_setting('t.a')::uuid)->'mine', '[9101, 9102, 9105]'::jsonb,
  'mine is the caller''s own picks');
select is(pg_temp.read('a3', current_setting('t.a')::uuid)->'mine', '[]'::jsonb,
  'a seat with no picks has an empty mine');

-- Counts never name anyone: only status, options and mine; options hold a genre id and a count.
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.read('a3', current_setting('t.a')::uuid)) k),
  '{mine,options,out,skips,status}'::text[], 'room_genres answers only status, options, mine, out and skips');
select is((select count(*) from jsonb_array_elements(pg_temp.read('a3', current_setting('t.a')::uuid)->'options') o
           where (select array_agg(k order by k) from jsonb_object_keys(o) k) <> '{count,genre_id}'
             and (select array_agg(k order by k) from jsonb_object_keys(o) k) <> '{count,genre_id,out}'),
  0::bigint, 'each option holds only a genre id and a count, and out when it is out tonight');
select is((select count(*) from public.room_members m
           where m.room_id = current_setting('t.a')::uuid
             and (pg_temp.read('a3', current_setting('t.a')::uuid)::text like '%' || m.id || '%'
               or pg_temp.read('a3', current_setting('t.a')::uuid)::text like '%' || m.profile_id || '%'
               or pg_temp.read('a3', current_setting('t.a')::uuid)::text like '%"' || m.display_name || '"%')),
  0::bigint, 'no seat id, profile id or name appears in the answer');

-- The broadcast: genres_changed with an empty payload, and no seat_updated naming the seat.
select is((select count(*) from tests.broadcasts(current_setting('t.a')::uuid, 'genres_changed')), 2::bigint,
  'each change of picks broadcasts genres_changed');
select is((select count(*) from tests.broadcasts(current_setting('t.a')::uuid, 'genres_changed') p where p - 'id' <> '{}'::jsonb),
  0::bigint, 'genres_changed carries an empty payload');
select set_config('t.seat_updates', (select count(*) from tests.broadcasts(current_setting('t.a')::uuid, 'seat_updated'))::text, true);
select pg_temp.genres('a3', current_setting('t.a')::uuid, '{9104}');
select is((select count(*) from tests.broadcasts(current_setting('t.a')::uuid, 'seat_updated'))::text, current_setting('t.seat_updates'),
  'a genres-only change sends no seat_updated (it would name the seat)');
select pg_temp.genres('a3', current_setting('t.a')::uuid, '{9104}');
select is((select count(*) from tests.broadcasts(current_setting('t.a')::uuid, 'genres_changed')), 3::bigint,
  'sending the same picks again broadcasts nothing');
select is(pg_temp.genres('a3', current_setting('t.a')::uuid, '{}')->>'status', 'ok', 'an empty list clears the picks');
select is(pg_temp.counts(pg_temp.read('a3', current_setting('t.a')::uuid))->>'9104', '0', 'a cleared pick no longer counts');

select throws_ok($$ select pg_temp.read('stranger', current_setting('t.a')::uuid) $$, '42501', null,
  'room_genres: a player without a seat gets 42501');
select throws_ok($$ select pg_temp.genres('stranger', current_setting('t.a')::uuid, '{9101}') $$, '42501', null,
  'set_seat_prefs: a player without a seat gets 42501');

-- ---------------------------------------------------------------------------------------
-- No picks: exactly today's deck
-- ---------------------------------------------------------------------------------------
select set_config('t.n', pg_temp.room(2, 'n')::text, true);
update public.rooms set seed = 7 where id = current_setting('t.n')::uuid;
create temp table today_order as
  select array_agg(c.title_id order by internal.shuffle_key(7, c.title_id, c.group_score) desc, c.title_id) as ids
  from internal.deck_candidates(current_setting('t.n')::uuid, 300, 1.0) c;
select is(pg_temp.start('n1', current_setting('t.n')::uuid), 'ok', 'premise: the no-picks game starts');
select is(tests.upcoming('n1', current_setting('t.n')::uuid), (select ids[1:25] from today_order),
  'no picks: the deck is today''s weighted shuffle, card for card');
select is((select pick_share from public.room_models where room_id = current_setting('t.n')::uuid), 0::real,
  'no picks: no slot draws from a pick pool');

-- ---------------------------------------------------------------------------------------
-- The weight, the mix and the shared opening
-- ---------------------------------------------------------------------------------------
-- o1 and o2 pick 9101, o3 picks 9102: films 51 to 100 weigh 1, 1 to 50 weigh 2/3, 101 to 150 1/3.
select set_config('t.o', pg_temp.room(3, 'o')::text, true);
update public.rooms set seed = 42 where id = current_setting('t.o')::uuid;
select pg_temp.genres('o1', current_setting('t.o')::uuid, '{9101}');
select pg_temp.genres('o2', current_setting('t.o')::uuid, '{9101}');
select pg_temp.genres('o3', current_setting('t.o')::uuid, '{9102}');
select is(pg_temp.start('o1', current_setting('t.o')::uuid), 'ok', 'premise: the genre game starts');

select is((select array_agg(p::text order by p::text) from public.room_models rm, jsonb_array_elements(rm.genre_picks) p where rm.room_id = current_setting('t.o')::uuid),
  '{[9101],[9101],[9102]}'::text[], 'Start locks the picks of the seats that picked');
select is(round(internal.pick_weight('{9101,9102}', '[[9101], [9101], [9102]]')::numeric, 3), 1.000,
  'the weight: a film matching every picking seat weighs 1');
select is(round(internal.pick_weight('{9102}', '[[9101], [9101], [9102]]')::numeric, 3), 0.333,
  'the weight: the share of picking seats whose picks it matches');
select is((select pick_share from public.room_models where room_id = current_setting('t.o')::uuid), 0.75::real,
  'a pick pool of 100 films or more takes 3 slots in 4');
select ok(tests.upcoming('o1', current_setting('t.o')::uuid) = tests.upcoming('o2', current_setting('t.o')::uuid)
      and tests.upcoming('o2', current_setting('t.o')::uuid) = tests.upcoming('o3', current_setting('t.o')::uuid),
  'every seat gets the same deck, so the shared opening stays shared');
select is((select count(*) from pg_temp.deck('o1', current_setting('t.o')::uuid) d where d.pos <= 10 and pg_temp.is_pick(d.pos, 0.75) and d.w > 0),
  8::bigint, 'the shared opening: 8 of the first 10 cards come from the pick pool');
select is((select count(*) from pg_temp.deck('o1', current_setting('t.o')::uuid) d where pg_temp.is_pick(d.pos, 0.75) and d.w = 0),
  0::bigint, 'every pick slot holds a film matching a pick');
select ok((select bool_and(d.kp >= coalesce(d.next_kp, '-infinity')) from (
             select x.kp, lead(x.kp) over (order by x.pos) as next_kp
             from pg_temp.deck('o1', current_setting('t.o')::uuid) x where pg_temp.is_pick(x.pos, 0.75)) d),
  'pick slots follow score + 0.3 x ln(weight) in the shuffle key');
select ok((select bool_and(d.k >= coalesce(d.next_k, '-infinity')) from (
             select x.k, lead(x.k) over (order by x.pos) as next_k
             from pg_temp.deck('o1', current_setting('t.o')::uuid) x where not pg_temp.is_pick(x.pos, 0.75)) d),
  'open slots follow today''s order, over every eligible film');
select cmp_ok((select count(*) from pg_temp.deck('o1', current_setting('t.o')::uuid) d where pg_temp.is_pick(d.pos, 0.75) and d.w = 1),
  '>', (select (count(*) / 3)::bigint from pg_temp.deck('o1', current_setting('t.o')::uuid) d where pg_temp.is_pick(d.pos, 0.75)),
  'the weight puts overlap first: films matching every pick fill more than their third of the pool''s slots');

-- Locked at Start; reading still works.
select is(pg_temp.genres('o3', current_setting('t.o')::uuid, '{9101}')->>'status', 'locked', 'picks are locked once the game starts');
select is(pg_temp.read('o3', current_setting('t.o')::uuid)->'mine', '[9102]'::jsonb,
  'after Start, room_genres still answers with the locked picks');
select ok(pg_temp.counts(pg_temp.read('o1', current_setting('t.o')::uuid)) ? '9105'
      and not exists (select 1 from internal.offered_genres(current_setting('t.o')::uuid) o where o.genre_id = 9105),
  'after Start, films already dealt still count toward the 30, so the offer does not shrink');

-- A late joiner plays the deck as it is.
select tests.create_player('late');
select set_config('t.o_code', (select code from public.rooms where id = current_setting('t.o')::uuid), true);
select tests.authenticate_as('late');
select api.join_room(current_setting('t.o_code'));
select tests.clear_authentication();
select is(pg_temp.genres('late', current_setting('t.o')::uuid, '{9104}')->>'status', 'locked',
  'a late joiner cannot pick genres');
select is((select array_agg(p::text order by p::text) from public.room_models rm, jsonb_array_elements(rm.genre_picks) p where rm.room_id = current_setting('t.o')::uuid),
  '{[9101],[9101],[9102]}'::text[], 'a late joiner does not change the locked picks');
select is((select count(*) from pg_temp.deck('late', current_setting('t.o')::uuid) d where pg_temp.is_pick(d.pos, 0.75) and d.w = 0),
  0::bigint, 'a late joiner''s deck keeps the same mix');

-- A refill carries the same rule.
select set_config('tests.room_id', current_setting('t.o'), true);
select tests.vote_next('o1', 20);
select is((select count(*) from pg_temp.deck('o1', current_setting('t.o')::uuid) d where d.pos > 25 and pg_temp.is_pick(d.pos, 0.75) and d.w = 0),
  0::bigint, 'a refill keeps the pick slots for the pick pool');

-- ---------------------------------------------------------------------------------------
-- The starvation guard, and seats without picks
-- ---------------------------------------------------------------------------------------
-- g1 picks 9104 (40 films), g2 picks nothing.
select set_config('t.g', pg_temp.room(2, 'g')::text, true);
select pg_temp.genres('g1', current_setting('t.g')::uuid, '{9104}');
select is(pg_temp.start('g1', current_setting('t.g')::uuid), 'ok', 'premise: the narrow game starts');
select is((select genre_picks from public.room_models where room_id = current_setting('t.g')::uuid), '[[9104]]'::jsonb,
  'a seat with no picks does not count in the weight');
select is((select pick_share from public.room_models where room_id = current_setting('t.g')::uuid), 0.3::real,
  'the guard: a pool of 40 films takes 3 in 4 x 40 / 100 of the slots');
select is((select count(*) from pg_temp.deck('g1', current_setting('t.g')::uuid) d where pg_temp.is_pick(d.pos, 0.3) and d.w = 0),
  0::bigint, 'the guard: the fewer pick slots still hold pick films');
select cmp_ok((select count(*) from pg_temp.deck('g1', current_setting('t.g')::uuid) d where d.pos <= 25 and pg_temp.is_pick(d.pos, 0.3)),
  '<', 10::bigint, 'the guard: fewer than 10 of the first 25 slots are pick slots');

select * from finish();
rollback;

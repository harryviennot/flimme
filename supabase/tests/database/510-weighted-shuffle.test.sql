-- M5.2: the SQL deal as a weighted shuffle (deck-engine.md#weighted-shuffle,
-- #the-sql-fallback, #building-a-deal). Each film's key is
-- score / 0.3 + Gumbel noise from a hash of (rooms.seed, title_id), so a room's
-- deck is repeatable from its seed, the best films still come first, and every
-- seat gets the same sequence (the shared opening of 10, then cards 11 to 25).
-- Made-up films only. Rooms are dealt through the real start_game on the SQL engine.

begin;
select plan(26);

select tests.create_catalog(300);
select tests.use_deck_engine('sql');

create function pg_temp.start_room(p_room jsonb, p_seed integer) returns void
language plpgsql
as $$
begin
  perform tests.use_deck_engine('sql');   -- deal_game sets 'server'
  update public.rooms set seed = p_seed where id = (p_room->>'room_id')::uuid;
  perform tests.authenticate_as(p_room->'players'->>0);
  perform api.start_game((p_room->>'room_id')::uuid);
  perform tests.clear_authentication();
end
$$;

-- Three rooms with the same settings and services: A and B share a seed, C does not.
select set_config('tests.a', tests.deal_game(3, 'a', 'lobby')::text, true);
select set_config('tests.b', tests.deal_game(3, 'b', 'lobby')::text, true);
select set_config('tests.c', tests.deal_game(3, 'c', 'lobby')::text, true);

-- What the group scores say before anything is dealt (room C), for test 6.
create temp table c_candidates as
select c.title_id, c.group_score from internal.deck_candidates(
  (current_setting('tests.c')::jsonb->>'room_id')::uuid, 300, 1.0) c;

select pg_temp.start_room(current_setting('tests.a')::jsonb, 12345);
select pg_temp.start_room(current_setting('tests.b')::jsonb, 12345);
select pg_temp.start_room(current_setting('tests.c')::jsonb, 99999);

create function pg_temp.room(p_key text) returns uuid
language sql stable
as $$ select (current_setting('tests.' || p_key)::jsonb->>'room_id')::uuid $$;

-- 1: same settings, services and seed give the same deck.
select is(tests.upcoming('a1', pg_temp.room('a')), tests.upcoming('b1', pg_temp.room('b')),
  'T1 two rooms with the same settings and seed deal the same 25 cards');

-- 2: another seed gives another opening.
select isnt((tests.upcoming('a1', pg_temp.room('a')))[1:10], (tests.upcoming('c1', pg_temp.room('c')))[1:10],
  'T2 a different seed opens differently');

-- 3: a start with 3 seats: 25 cards each, same order, 10 opening then 15 ranked, pool of 25.
select is((select count(*) from public.deck_entries d where d.room_id = pg_temp.room('a')), 75::bigint,
  'T3 three seats hold 25 entries each');
select ok(tests.upcoming('a1', pg_temp.room('a')) = tests.upcoming('a2', pg_temp.room('a'))
      and tests.upcoming('a2', pg_temp.room('a')) = tests.upcoming('a3', pg_temp.room('a'))
      and cardinality(tests.upcoming('a1', pg_temp.room('a'))) = 25,
  'T3 every seat has the same 25 cards in the same order');
select is(
  (select string_agg(x.source::text, ',' order by x.sort_key) from (
     select d.source, d.sort_key from public.deck_entries d
     where d.room_member_id = tests.member_id('a2', pg_temp.room('a')) order by d.sort_key) x),
  (select string_agg('opening', ',') from generate_series(1, 10)) || ',' ||
  (select string_agg('ranked', ',') from generate_series(1, 15)),
  'T3 the first 10 cards are the opening, the next 15 are ranked');
select is((select count(*) from public.room_cards c where c.room_id = pg_temp.room('a')), 25::bigint,
  'T3 the pool holds the 25 films dealt');

-- 4: the better film wins about 28 times in 29.
select ok(
  (select count(*) filter (where internal.shuffle_key(s, 1::bigint, 4.0::real) > internal.shuffle_key(s, 2::bigint, 3.0::real))
   from generate_series(1, 2000) s) between 1860 and 1980,
  'T4 a film scored 4.0 beats one scored 3.0 between 93% and 99% of the time');

-- 5: equal scores are a coin flip, and a key is repeatable.
select ok(
  (select count(*) filter (where internal.shuffle_key(s, 1::bigint, 3.0::real) > internal.shuffle_key(s, 2::bigint, 3.0::real))
   from generate_series(1, 2000) s) between 900 and 1100,
  'T5 equal scores put each film first between 45% and 55% of the time');
select is(internal.shuffle_key(42, 7::bigint, 3.5::real), internal.shuffle_key(42, 7::bigint, 3.5::real),
  'T5 the same seed, film and score give the same key');
select tests.authenticate_as('a1');
select throws_ok($$select internal.shuffle_key(1, 1::bigint, 1.0::real)$$, '42501', null,
  'T5 a player cannot call internal.shuffle_key');
select tests.clear_authentication();

-- 6: the first card's propensity is its softmax share among all the candidates.
select ok(
  (select abs(i.propensity - (exp(f.group_score / 0.3) / s.total)) < 1e-4 * (exp(f.group_score / 0.3) / s.total)
   from rec.request_items i
   join rec.requests r on r.id = i.request_id and r.room_id = pg_temp.room('c')
   join c_candidates f on f.title_id = i.title_id
   cross join (select sum(exp(group_score / 0.3)::numeric) as total from c_candidates) s
   where i.position = 1 and i.room_member_id = tests.member_id('c1', pg_temp.room('c'))),
  'T6 the first card''s propensity is e^(s/0.3) over the sum across all candidates');
select ok(
  (select bool_and(i.propensity > 0 and i.propensity <= 1) and count(*) = 75
   from rec.request_items i join rec.requests r on r.id = i.request_id and r.room_id = pg_temp.room('c')),
  'T6 every logged propensity is in (0, 1]');

-- 7: 60 eligible films, 48 above the misery line: the line drops and all 60 are drawn from.
create function pg_temp.sixty() returns void
language plpgsql
as $$
declare v_id bigint; i integer;
begin
  perform tests.create_provider(9101, 'Sixty Service');
  for i in 1..60 loop
    v_id := tests.create_title('Sixty Film ' || lpad(i::text, 2, '0'));
    update public.titles set poster_path = '/s.jpg', popularity = i, quality_score = 6.2 + i / 20.0 where id = v_id;
    insert into public.title_availability (title_id, country, provider_id, kind) values (v_id, 'FR', 9101, 'subscription');
  end loop;
end
$$;
select pg_temp.sixty();
select set_config('tests.d', tests.deal_game(2, 'd', 'lobby')::text, true);
update public.rooms set provider_ids = '{9101}' where id = pg_temp.room('d');
select is((select count(*) from internal.deck_candidates(pg_temp.room('d'), 300, 1.0)), 48::bigint,
  'T7 premise: 48 of the 60 films are above the misery line');
select pg_temp.start_room(current_setting('tests.d')::jsonb, 4242);
select is(
  (select r.candidates::text || '/' || (select count(*) from public.room_cards c where c.room_id = pg_temp.room('d'))
   from rec.requests r where r.room_id = pg_temp.room('d')),
  '60/25',
  'T7 under 50 survivors the line drops: the deal draws from all 60 and logs 60 candidates');

-- 8: refills. a1 votes 10 times and is back to 25; a2 then gets a1's new films first, in a1's order.
select set_config('tests.room_id', pg_temp.room('a')::text, true);
select tests.vote_next('a1', 10);
select is(cardinality(tests.upcoming('a1', pg_temp.room('a'))), 25,
  'T8 after 10 votes the refill brings a1 back to 25 unvoted cards');
select tests.vote_next('a2', 10);
select is(cardinality(tests.upcoming('a2', pg_temp.room('a'))), 25,
  'T8 after 10 votes the refill brings a2 back to 25 unvoted cards');
select is((tests.upcoming('a2', pg_temp.room('a')))[16:25], (tests.upcoming('a1', pg_temp.room('a')))[16:25],
  'T8 a2 gets the films a1''s refill added, in the same order');
select is((tests.upcoming('a2', pg_temp.room('a')))[1:15], (tests.upcoming('a3', pg_temp.room('a')))[11:25],
  'T8 a2 keeps cards 11 to 25 of the shared opening in front');
select is((select count(*) from public.room_cards c where c.room_id = pg_temp.room('a')), 35::bigint,
  'T8 the second refill adds no film to the pool');

-- 9: a late joiner gets the opening, then the others' cards 11 to 25 in the same order.
select tests.create_player('b4');
select tests.authenticate_as('b4');
select api.join_room(current_setting('tests.b')::jsonb->>'code');
select tests.clear_authentication();
select is(cardinality(tests.upcoming('b4', pg_temp.room('b'))), 25, 'T9 the late joiner holds 25 cards');
select is(tests.upcoming('b4', pg_temp.room('b')), tests.upcoming('b1', pg_temp.room('b')),
  'T9 the late joiner sees the same sequence as the seats that started');

-- 10: nothing to deal, nothing logged.
select set_config('tests.requests', (select count(*) from rec.requests where room_id = pg_temp.room('b'))::text, true);
select is(internal.deal_baseline(pg_temp.room('b'), tests.member_id('b1', pg_temp.room('b'))),
  jsonb_build_object('status', 'ok', 'request_id', null, 'started', false, 'seats', 0),
  'T10 a refill for a seat already at 25 answers seats 0 and no request');
select is((select count(*) from rec.requests where room_id = pg_temp.room('b'))::text, current_setting('tests.requests'),
  'T10 and logs no request');

-- 11: the request is the SQL baseline's.
select is(
  (select string_agg(distinct r.model_version, ',') from rec.requests r where r.room_id = pg_temp.room('a')),
  'sql-baseline', 'T11 the requests are logged as sql-baseline');
select ok((select bool_and(r.is_fallback) from rec.requests r where r.room_id = pg_temp.room('a')),
  'T11 the requests are marked as fallbacks');
select is(
  (select string_agg(r.kind, ',' order by r.id) from rec.requests r where r.room_id = pg_temp.room('a')),
  'start,refill,refill', 'T11 the kinds are start, then refill for each seat');

select * from finish();
rollback;

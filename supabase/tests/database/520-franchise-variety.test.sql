-- M5.3: one film per franchise (TMDB collection) in any 10 cards, the opening
-- included (deck-engine.md#variety, #the-sql-fallback). A franchise-heavy
-- made-up catalog: 60 films, 15 in collection 1001 (scored highest, so the
-- shuffle wants them early), 10 in 1002, 5 in 1003 and 30 with none.
-- Rooms are dealt through the real start_game on the SQL engine.

begin;
select plan(14);

select tests.use_deck_engine('sql');

-- deal_game wants 25 'Catalog Film's on service 9001 to seat players; take them off the
-- service so only the franchise films are eligible there.
select tests.create_catalog(25);
delete from public.title_availability where provider_id = 9001;

create function pg_temp.franchise_catalog() returns void
language plpgsql
as $$
declare v_id bigint; i integer;
begin
  for i in 1..60 loop
    v_id := tests.create_title('Franchise Film ' || lpad(i::text, 2, '0'));
    update public.titles set poster_path = '/f.jpg', popularity = 500 - i,
      quality_score = case when i <= 15 then 9.0 + i / 100.0 else 6.5 + (i % 10) / 10.0 end,
      collection_id = case when i <= 15 then 1001 when i <= 25 then 1002 when i <= 30 then 1003 end
    where id = v_id;
    insert into public.title_availability (title_id, country, provider_id, kind) values (v_id, 'FR', 9001, 'subscription');
  end loop;
end
$$;
select pg_temp.franchise_catalog();

create function pg_temp.start_room(p_key text, p_seats integer, p_seed integer) returns void
language plpgsql
as $$
declare v_game jsonb;
begin
  v_game := tests.deal_game(p_seats, p_key, 'lobby');
  perform set_config('tests.' || p_key, v_game::text, true);
  perform tests.use_deck_engine('sql');
  update public.rooms set seed = p_seed, provider_ids = '{9001}' where id = (v_game->>'room_id')::uuid;
  perform tests.authenticate_as(v_game->'players'->>0);
  perform api.start_game((v_game->>'room_id')::uuid);
  perform tests.clear_authentication();
end
$$;

create function pg_temp.room(p_key text) returns uuid
language sql stable
as $$ select (current_setting('tests.' || p_key)::jsonb->>'room_id')::uuid $$;

-- How many pairs of cards in a seat's deck are 9 positions or less apart and share a
-- collection (every entry counts, voted or not, as the rule's window does).
create function pg_temp.clashes(p_name text, p_key text) returns bigint
language sql
as $$
  with deck as (
    select t.collection_id as coll, row_number() over (order by d.sort_key) as rn
    from public.deck_entries d join public.titles t on t.id = d.title_id
    where d.room_member_id = tests.member_id(p_name, pg_temp.room(p_key))
  )
  select count(*) from deck a join deck b on a.coll = b.coll and b.rn > a.rn and b.rn - a.rn <= 9
$$;

select pg_temp.start_room('a', 3, 777);
select pg_temp.start_room('b', 3, 777);

-- 1: a start with 3 seats: no collection twice within any 10 cards, the opening included.
select is((select count(*) from public.deck_entries d where d.room_id = pg_temp.room('a')), 75::bigint,
  'T1 premise: the 60 films are enough for 25 cards per seat');
select ok((select count(*) from public.deck_entries d join public.titles t on t.id = d.title_id
           where d.room_member_id = tests.member_id('a1', pg_temp.room('a')) and t.collection_id = 1001) >= 2,
  'T1 premise: the best-scored franchise is dealt more than once, spread out');
select is(pg_temp.clashes('a1', 'a') + pg_temp.clashes('a2', 'a') + pg_temp.clashes('a3', 'a'), 0::bigint,
  'T1 in every seat''s deck no franchise repeats within 10 cards');

-- 2: the shared opening is still identical.
select ok(tests.upcoming('a1', pg_temp.room('a')) = tests.upcoming('a2', pg_temp.room('a'))
      and tests.upcoming('a2', pg_temp.room('a')) = tests.upcoming('a3', pg_temp.room('a')),
  'T2 every seat has the same cards in the same order, the opening included');

-- 3: films with no collection can sit next to each other.
select ok(exists (
  select 1 from (
    select t.collection_id as coll, lag(t.collection_id) over (order by d.sort_key) as prev,
           row_number() over (order by d.sort_key) as rn
    from public.deck_entries d join public.titles t on t.id = d.title_id
    where d.room_member_id = tests.member_id('a1', pg_temp.room('a'))) x
  where x.coll is null and x.prev is null and x.rn > 1),
  'T3 films with no collection sit next to each other');

-- 7: the walk is repeatable: same seed and settings give the same decks.
select is(tests.upcoming('a1', pg_temp.room('a')), tests.upcoming('b1', pg_temp.room('b')),
  'T7 two rooms with the same seed and settings deal the same decks');

-- 4: a refill keeps the rule across the join.
select set_config('tests.room_id', pg_temp.room('a')::text, true);
select tests.vote_next('a1', 10);
select is(cardinality(tests.upcoming('a1', pg_temp.room('a'))), 25, 'T4 premise: a1 was refilled to 25');
select is(pg_temp.clashes('a1', 'a'), 0::bigint,
  'T4 after the refill no franchise repeats within 10 cards, voted cards included');

-- 6: a late joiner gets the copied opening, then cards after it, all under the rule.
select tests.create_player('b4');
select tests.authenticate_as('b4');
select api.join_room(current_setting('tests.b')::jsonb->>'code');
select tests.clear_authentication();
select is(cardinality(tests.upcoming('b4', pg_temp.room('b'))), 25, 'T6 premise: the late joiner holds 25 cards');
select is(pg_temp.clashes('b4', 'b'), 0::bigint,
  'T6 the rule holds over the copied opening and the cards after it');

-- 8: a liked film propagated into a deck stays where the like put it.
select set_config('tests.liked', ((tests.upcoming('b1', pg_temp.room('b')))[20])::text, true);
select tests.authenticate_as('b1');
select api.cast_vote((current_setting('tests.b')::jsonb->>'room_id')::uuid, current_setting('tests.liked')::bigint, 'like');
select tests.clear_authentication();
select is((select d.source::text from public.deck_entries d
           where d.room_member_id = tests.member_id('b2', pg_temp.room('b'))
             and d.title_id = current_setting('tests.liked')::bigint),
  'propagated', 'T8 the liked film was moved up in another seat''s deck');
select is((select count(*) from public.deck_entries d where d.room_member_id = tests.member_id('b2', pg_temp.room('b'))), 25::bigint,
  'T8 and nothing was removed to keep the rule');

-- 5: a refill where every remaining film clashes deals fewer cards, 0 is fine.
-- Every film now shares one collection, so nothing fits next to the last 9 cards.
select set_config('tests.requests', (select count(*) from rec.requests where room_id = pg_temp.room('a'))::text, true);
update public.titles set collection_id = 1999 where original_title like 'Franchise Film %';
delete from public.deck_entries d
where d.room_member_id = tests.member_id('a2', pg_temp.room('a'))
  and d.title_id in (select x.title_id from public.deck_entries x
                     where x.room_member_id = d.room_member_id order by x.sort_key desc limit 3);
select is(internal.deal_baseline(pg_temp.room('a'), tests.member_id('a2', pg_temp.room('a'))),
  jsonb_build_object('status', 'ok', 'request_id', null, 'started', false, 'seats', 0),
  'T5 a refill whose films all share a franchise with the last 9 cards deals 0 and answers seats 0');
select is((select count(*) from rec.requests where room_id = pg_temp.room('a'))::text, current_setting('tests.requests'),
  'T5 and logs no request');

select * from finish();
rollback;

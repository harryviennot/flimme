-- The SQL deal (roadmap task M1.13): with `deck_engine` set to `sql`, starting a
-- game and refills deal the SQL baseline at once, without the 8-second wait
-- (data-model.md#start-dealing-the-deck, #like-propagation-and-refills,
-- #configuration). With `server`, or no key at all, the deck worker deals as before.
--
-- Which films the baseline picks, and how many, belong to roadmap task M5.2: the
-- tests only check that cards arrive, in the same call, with nothing queued.

begin;
select plan(31);

select tests.create_catalog(100);

-- T1: the keys are readable by a signed-in player.
select tests.create_player('reader');
select tests.authenticate_as('reader');
select is((select value from api.app_config where key = 'deck_engine'), '"sql"'::jsonb,
  'T1 api.app_config shows deck_engine = sql to a signed-in player');
select is((select value from api.app_config where key = 'tmdb_image_base'), '"https://image.tmdb.org/t/p/"'::jsonb,
  'T1 api.app_config shows tmdb_image_base to a signed-in player');
select tests.clear_authentication();

-- T2: under sql, start_game deals at once.
select tests.deal_game(2, 'a', 'lobby');
select tests.use_deck_engine('sql');
select tests.authenticate_as('a1');
select set_config('tests.start', api.start_game(tests.room_id())::text, true);
select tests.clear_authentication();
select is(
  (select (a->>'status') || '/' || (a->>'started') || '/' || coalesce(a->>'fallback', 'none')
   from (select current_setting('tests.start')::jsonb as a) x),
  'ok/true/none',
  'T2 start_game answers ok, started, with no fallback field'
);
select is((select state::text from public.rooms where id = tests.room_id()), 'swiping',
  'T2 the room is swiping straight after start_game');
select tests.authenticate_as('a1');
select cmp_ok(jsonb_array_length(api.my_next_cards(tests.room_id(), 30)), '>=', 10,
  'T2 the host has at least 10 cards in my_next_cards');
select tests.authenticate_as('a2');
select cmp_ok(jsonb_array_length(api.my_next_cards(tests.room_id(), 30)), '>=', 10,
  'T2 the other seat has at least 10 cards in my_next_cards');
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('deck_requests') q where (q->>'room_id')::uuid = tests.room_id()),
  0::bigint,
  'T2 nothing is queued on deck_requests for the room'
);
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') b where b->>'state' = 'swiping'),
  1::bigint,
  'T2 one state_changed broadcast says swiping'
);
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') b where b->>'state' = 'dealing'),
  1::bigint,
  'T2 the dealing broadcast is kept (Q13.5)'
);

-- T8: the deal is logged as the SQL baseline.
select is(
  (select string_agg(r.kind || '/' || r.model_version, ',') from rec.requests r where r.room_id = tests.room_id()),
  'start/sql-baseline',
  'T8 the start is logged in rec.requests with model_version sql-baseline'
);

-- T3: under sql, the vote that leaves a seat 15 cards deals more in the same call.
-- Only a1 votes, and always nopes, so no match and no finale.
select tests.vote_next('a1', 14);
select is(cardinality(tests.upcoming('a1')), 16,
  'T3 control: 16 cards left after 14 votes, nothing dealt yet');
select tests.vote_next('a1', 1);
select cmp_ok(cardinality(tests.upcoming('a1')), '>', 15,
  'T3 the vote that leaves 15 cards deals new cards to the seat in the same call');
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'deck_updated') b
   where b->'member_ids' ? tests.member_id('a1')::text),
  1::bigint,
  'T3 one deck_updated broadcast names the seat'
);
select is(
  (select count(*) from tests.queued('deck_requests') q where (q->>'room_id')::uuid = tests.room_id()),
  0::bigint,
  'T3 nothing is queued on deck_requests'
);
select is(
  (select string_agg(r.kind || '/' || r.model_version, ',') from rec.requests r
   where r.room_id = tests.room_id() and r.room_member_id = tests.member_id('a1')),
  'refill/sql-baseline',
  'T3 the refill is logged for the seat with model_version sql-baseline'
);

-- T4: under sql, a late joiner gets the opening and the baseline at once.
select tests.create_player('a3');
select tests.authenticate_as('a3');
select is(
  (select (a->>'status') || '/' || (a->>'rejoined') from (select api.join_room(tests.room_code()) as a) x),
  'ok/false',
  'T4 joining while swiping answers ok, not rejoined'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.deck_entries e where e.room_member_id = tests.member_id('a3') and e.source = 'opening'),
  10::bigint,
  'T4 the late joiner has the 10 opening cards'
);
select cmp_ok(
  (select count(*) from public.deck_entries e where e.room_member_id = tests.member_id('a3')),
  '>', 10::bigint,
  'T4 the late joiner also has baseline cards after the opening, at once'
);
select is(
  (select count(*) from tests.queued('deck_requests') q where (q->>'room_id')::uuid = tests.room_id()),
  0::bigint,
  'T4 nothing is queued for the late joiner'
);

-- T3b (beyond the brief): with no films left to deal, the vote at 15 cards still
-- answers ok. The room's services are swapped for one with no films, so the
-- baseline finds nothing; before M1.13's fix deal_baseline raised 22023 here.
select tests.deal_game(2, 'e');
select tests.use_deck_engine('sql');
update public.rooms set provider_ids = '{9999}' where id = tests.room_id();
select tests.vote_next('e1', 9);
select lives_ok($$select tests.vote_next('e1', 1)$$,
  'T3b with no films left to deal, the vote that leaves 15 cards still answers ok');
select is(cardinality(tests.upcoming('e1')), 15,
  'T3b nothing was dealt: the seat has its 15 cards');

-- T5: under sql, request_cards at 5 cards left deals at once.
select tests.deal_game(2, 'b');
select tests.use_deck_engine('sql');
delete from public.deck_entries d
where d.room_member_id = tests.member_id('b1')
  and d.title_id <> all ((tests.upcoming('b1'))[1:5]);
select tests.authenticate_as('b1');
select is(
  (select (a->>'status') || '/' || coalesce(a->>'fallback', 'none')
   from (select api.request_cards(tests.room_id()) as a) x),
  'ok/none',
  'T5 with 5 cards left, request_cards deals: ok, with no fallback field'
);
select tests.clear_authentication();
select cmp_ok(cardinality(tests.upcoming('b1')), '>', 5,
  'T5 the seat has more than 5 cards after request_cards');
select is(
  (select count(*) from tests.queued('deck_requests') q where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'),
  0::bigint,
  'T5 nothing is queued on deck_requests'
);

-- T6: under server, start_game queues for the deck worker, as before.
select tests.deal_game(2, 'c', 'lobby');
select tests.use_deck_engine('server');
select tests.authenticate_as('c1');
select is((select api.start_game(tests.room_id())->>'status'), 'dealing',
  'T6 under server, start_game answers dealing');
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'dealing',
  'T6 under server, the room waits in dealing');
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'start'),
  1::bigint,
  'T6 under server, one start message is queued'
);

-- T7: with no deck_engine key, the server deals.
select tests.deal_game(2, 'd', 'lobby');
delete from public.app_config where key = 'deck_engine';
select is(internal.deck_engine(), 'server', 'T7 with no key, internal.deck_engine() answers server');
select tests.authenticate_as('d1');
select is((select api.start_game(tests.room_id())->>'status'), 'dealing',
  'T7 with no key, start_game answers dealing');
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'start'),
  1::bigint,
  'T7 with no key, one start message is queued'
);

-- The helper is internal: no phone can call it.
select is(
  has_function_privilege('authenticated', 'internal.deck_engine()', 'execute')
    or has_function_privilege('anon', 'internal.deck_engine()', 'execute'),
  false,
  'contract: internal.deck_engine() is not executable by anon or authenticated'
);

select * from finish();
rollback;

-- The contract between Postgres and the recommendation server: starting a game,
-- joining while it starts, what the server may read and write, and what a deal
-- leaves behind (data-model.md#start-dealing-the-deck, #create-and-join and
-- recommendation-server.md#the-contract-with-the-database).
--
-- This file assumes the server deals the start. The `deck_engine` setting of
-- roadmap task M1.13 does not exist yet; when it makes the SQL deal the default,
-- setup here must set it to `server` first.
--
-- S1b, S5b, S6b and S10b are beyond the 120 checks of data-model.md#what-was-tested.
-- Nothing here pins which films the candidates or the baseline pick, how many, or
-- the match_rules numbers (those move in M5.1, M5.2 and M6.1).

begin;
select plan(38);

select tests.create_catalog(40);

-- S1b (beyond the 120): a room of one cannot start.
select tests.create_room(1, 'quick_match', 'FR', 'solo');
select tests.authenticate_as('solo1');
select is(
  (select (a->>'status') || '/' || (a->>'need')
   from (select api.start_game(tests.room_id()) as a) x),
  'not_enough_players/' || (select gm.min_players from public.game_modes gm where gm.slug = 'quick_match'),
  'S1b (beyond the 120) start_game answers not_enough_players with the mode''s minimum'
);
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'lobby',
  'S1b (beyond the 120) the room stays in the lobby');

-- S1: start puts the room in dealing.
select tests.deal_game(2, 'p', 'lobby');
select tests.authenticate_as('p1');
select is((select api.start_game(tests.room_id())->>'status'), 'dealing', 'S1 start_game answers dealing');
select tests.clear_authentication();
select is(
  (select r.state::text || '/' || (r.dealing_at is not null)::text from public.rooms r where r.id = tests.room_id()),
  'dealing/true',
  'S1 the room is dealing, with dealing_at set'
);
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') b where b->>'state' = 'dealing'),
  1::bigint,
  'S1 one state_changed broadcast says dealing'
);

-- S2: one request is queued.
select is(
  (select count(*) from tests.queued('deck_requests') q where (q->>'room_id')::uuid = tests.room_id()),
  1::bigint,
  'S2 the start queued exactly one request for the room'
);
select is(
  (select q->>'kind' from tests.queued('deck_requests') q where (q->>'room_id')::uuid = tests.room_id()),
  'start',
  'S2 the queued request is a start'
);

-- S3: joining while dealing says starting.
select tests.create_player('p3');
select tests.authenticate_as('p3');
select is((select api.join_room(tests.room_code())->>'status'), 'starting', 'S3 joining while dealing answers starting');
select tests.clear_authentication();
select is((select count(*) from public.room_members where profile_id = tests.uid('p3')), 0::bigint,
  'S3 the late player has no seat');

-- S4: rejoining keeps the seat.
select tests.authenticate_as('p2');
select is(
  (select (a->>'status') || '/' || (a->>'member_id') || '/' || (a->>'rejoined') || '/' || (a->>'state')
   from (select api.join_room(tests.room_code()) as a) x),
  'ok/' || tests.member_id('p2') || '/true/dealing',
  'S4 a seated player joining again gets the same seat back while dealing'
);
select tests.clear_authentication();
select is((select count(*) from public.room_members where room_id = tests.room_id()), 2::bigint,
  'S4 the room still has 2 seats');

-- S5: the server reads seats and candidates directly.
select tests.act_as_server();
select is((select count(*) from public.room_members where room_id = tests.room_id()), 2::bigint,
  'S5 the server reads the room''s seats from public.room_members');
select cmp_ok(
  (select count(*) from internal.deck_candidates(tests.room_id())), '>=', 1::bigint,
  'S5 the server gets at least one candidate for the room'
);
select is(
  (select count(*) from internal.deck_candidates(tests.room_id()) c
   where c.title_id not in (select t.id from public.titles t where t.original_title like 'Catalog Film %')),
  0::bigint,
  'S5 every candidate is a film of the fixture catalog'
);
select tests.clear_authentication();

-- S5b (beyond the 120): the server never writes votes or room state, only stats.
select tests.act_as_server();
select throws_ok(
  format($q$insert into public.votes (room_id, room_member_id, title_id, answer) values (%L, %L, %s, 'nope')$q$,
         tests.room_id(), tests.member_id('p1'), tests.title_id('Catalog Film 001')),
  '42501', null, 'S5b (beyond the 120) the server cannot insert a vote'
);
select throws_ok(
  format($q$update public.rooms set state = 'swiping' where id = %L$q$, tests.room_id()),
  '42501', null, 'S5b (beyond the 120) the server cannot change the room''s state'
);
select lives_ok(
  format($q$update public.rooms set stats = '{}' where id = %L$q$, tests.room_id()),
  'S5b (beyond the 120) the server can write the room''s stats (the control)'
);
select tests.clear_authentication();

-- S6: the server deals through deal_cards, which starts the game.
select set_config('tests.deal', (tests.deal_game(2, 's'))::text, true);
select is(
  (current_setting('tests.deal')::jsonb->'deal'->>'status') || '/'
    || (current_setting('tests.deal')::jsonb->'deal'->>'started') || '/'
    || (current_setting('tests.deal')::jsonb->'deal'->>'seats'),
  'ok/true/2',
  'S6 deal_cards answers ok, started and 2 seats'
);
select is(
  (select r.state::text || '/' || (r.started_at is not null)::text from public.rooms r where r.id = tests.room_id()),
  'swiping/true',
  'S6 the room is swiping, with started_at set'
);
select is(
  (select jsonb_array_length(r.rule) from public.rooms r where r.id = tests.room_id()),
  (select count(*)::int from public.match_rules mr where mr.mode = 'quick_match'),
  'S6 the room''s rule holds one bracket per quick_match row of match_rules'
);
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') b where b->>'state' = 'swiping'),
  1::bigint,
  'S6 one state_changed broadcast says swiping'
);

-- S7: the request is logged with its model and variant.
select is(
  (select count(*) from rec.requests where room_id = tests.room_id()), 1::bigint,
  'S7 the deal logged one request for the room'
);
select is(
  (select q.kind || '/' || q.model_version || '/' || q.experiment || '/' || q.variant || '/' || q.is_fallback::text
          || '/' || (q.room_member_id is null)::text || '/' || (q.id::text = current_setting('tests.deal')::jsonb->'deal'->>'request_id')::text
   from rec.requests q where q.room_id = tests.room_id()),
  'start/test-ranker/test-experiment/a/false/true/true',
  'S7 the request has its kind, model, experiment and variant, is not a fallback, is for the whole room, and is the one deal_cards answered with'
);

-- S8: every ranked card is logged, with its position.
select is(
  (select count(*) from rec.request_items i join rec.requests q on q.id = i.request_id where q.room_id = tests.room_id()),
  50::bigint,
  'S8 the request logged every card sent, 25 for each of 2 seats'
);
select is(
  (select bool_and(x.positions = (select array_agg(g) from generate_series(1, 25) g)) from (
     select array_agg(i.position::int order by i.position) as positions
     from rec.request_items i join rec.requests q on q.id = i.request_id
     where q.room_id = tests.room_id() group by i.room_member_id) x),
  true,
  'S8 each seat''s positions are 1 to 25'
);
select is(
  (select array_agg(i.title_id order by i.position) from rec.request_items i
   where i.room_member_id = tests.member_id('s1')),
  (select array(select jsonb_array_elements_text(current_setting('tests.deal')::jsonb->'title_ids')::bigint)),
  'S8 the first seat''s positions follow the order sent'
);
select is(
  (select i.title_id from rec.request_items i where i.room_member_id = tests.member_id('s2') and i.position = 11),
  (current_setting('tests.deal')::jsonb->'title_ids'->>24)::bigint,
  'S8 the second seat''s personal cards follow the order sent, descending after the opening'
);

-- S9: every deck entry links to the request.
select cmp_ok((select count(*) from public.deck_entries where room_id = tests.room_id()), '>=', 1::bigint,
  'S9 the room has deck entries');
select is(
  (select count(*) from public.deck_entries e
   where e.room_id = tests.room_id()
     and e.request_id is distinct from (current_setting('tests.deal')::jsonb->'deal'->>'request_id')::bigint),
  0::bigint,
  'S9 every deck entry links to the request that dealt it'
);

-- S10: the deal has a 10-card shared opening.
select is(
  (select bool_and(x.sources = array_fill('opening'::text, array[10])) from (
     select (select array_agg(o.source::text) from (
               select e.source from public.deck_entries e where e.room_member_id = m.id
               order by e.sort_key limit 10) o) as sources
     from public.room_members m where m.room_id = tests.room_id()) x),
  true,
  'S10 each seat''s 10 lowest entries are opening cards'
);
select is(
  (select array_agg(e.title_id order by e.sort_key) from (
     select e.title_id, e.sort_key from public.deck_entries e where e.room_member_id = tests.member_id('s1')
     order by e.sort_key limit 10) e),
  (select array_agg(e.title_id order by e.sort_key) from (
     select e.title_id, e.sort_key from public.deck_entries e where e.room_member_id = tests.member_id('s2')
     order by e.sort_key limit 10) e),
  'S10 both seats get the same 10 opening films in the same order'
);
select isnt(
  (select e.title_id from public.deck_entries e where e.room_member_id = tests.member_id('s1')
   order by e.sort_key offset 10 limit 1),
  (select e.title_id from public.deck_entries e where e.room_member_id = tests.member_id('s2')
   order by e.sort_key offset 10 limit 1),
  'S10 the 11th entries differ (the control: only the opening is shared)'
);

-- S10b (beyond the 120): a late joiner gets the opening and a queued refill.
select tests.create_player('s3');
select tests.authenticate_as('s3');
select is(
  (select (a->>'status') || '/' || (a->>'rejoined')
   from (select api.join_room(tests.room_code()) as a) x),
  'ok/false',
  'S10b (beyond the 120) joining while swiping answers ok, not rejoined'
);
select tests.clear_authentication();
select is(
  (select array_agg(e.title_id order by e.sort_key) from public.deck_entries e
   where e.room_member_id = tests.member_id('s3') and e.source = 'opening'),
  (select array_agg(e.title_id order by e.sort_key) from (
     select e.title_id, e.sort_key from public.deck_entries e where e.room_member_id = tests.member_id('s1')
     order by e.sort_key limit 10) e),
  'S10b (beyond the 120) the late joiner''s deck holds the 10 opening films in the first seat''s order'
);
select is(
  (select count(*) from public.deck_entries e where e.room_member_id = tests.member_id('s3')), 10::bigint,
  'S10b (beyond the 120) the late joiner''s deck holds only the opening until the refill arrives'
);
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
     and (q->>'room_member_id')::uuid = tests.member_id('s3'))
  || '/' || (select (m.refill_requested_at is not null)::text from public.room_members m where m.id = tests.member_id('s3')),
  '1/true',
  'S10b (beyond the 120) one refill is queued for the late joiner''s seat and the flag is set'
);

-- S6b (beyond the 120, last): a room that moved on answers closed.
update public.rooms set state = 'done' where id = tests.room_id();
select tests.act_as_server();
select is(
  (select internal.deal_cards(tests.room_id(), jsonb_build_object(
     'request', jsonb_build_object('kind', 'refill', 'room_member_id', tests.member_id('s1'), 'model_version', 'test-ranker'),
     'pool', '[]'::jsonb, 'decks', '[]'::jsonb))->>'status'),
  'closed',
  'S6b (beyond the 120) deal_cards answers closed once the room is done'
);
select tests.clear_authentication();
select is((select count(*) from rec.requests where room_id = tests.room_id()), 1::bigint,
  'S6b (beyond the 120) the closed answer logged no new request');

select * from finish();
rollback;

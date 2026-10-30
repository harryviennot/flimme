-- When the server never answers: the host's second tap and a phone running low
-- both get dealt by the SQL baseline after 8 seconds
-- (data-model.md#start-dealing-the-deck and #like-propagation-and-refills).
-- The 8 seconds is a starting value, tested as the doc states it. Time is never
-- waited for: dealing_at and refill_requested_at are backdated.
--
-- This file assumes the server deals the start. When roadmap task M1.13 makes the
-- SQL deal the default, setup here must set `deck_engine` to `server` first.
--
-- Which films the baseline picks, and how many, belong to roadmap task M5.2: the
-- tests only check that fallback cards exist and come from the fixture catalog.

begin;
select plan(27);

select tests.create_catalog(60);

-- F1: a start the server never answers is dealt by the baseline on the second tap after 8 seconds.
select tests.deal_game(2, 'f', 'dealing');
update public.rooms set dealing_at = now() - interval '7 seconds' where id = tests.room_id();
select tests.authenticate_as('f1');
select is((select api.start_game(tests.room_id())->>'status'), 'dealing',
  'F1 a second tap after 7 seconds still answers dealing');
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'dealing',
  'F1 the room stays dealing after 7 seconds');
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'start'),
  1::bigint,
  'F1 there is still one start request in the queue');

update public.rooms set dealing_at = now() - interval '9 seconds' where id = tests.room_id();
select tests.authenticate_as('f1');
select is(
  (select (a->>'status') || '/' || (a->>'fallback') || '/' || (a->>'started')
   from (select api.start_game(tests.room_id()) as a) x),
  'ok/true/true',
  'F1 a second tap after 9 seconds deals the baseline: ok, fallback, started'
);
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'swiping',
  'F1 the room is swiping after the baseline deal');
select is(
  (select array_agg(e.title_id order by e.sort_key) from (
     select e.title_id, e.sort_key from public.deck_entries e where e.room_member_id = tests.member_id('f1')
     order by e.sort_key limit 10) e),
  (select array_agg(e.title_id order by e.sort_key) from (
     select e.title_id, e.sort_key from public.deck_entries e where e.room_member_id = tests.member_id('f2')
     order by e.sort_key limit 10) e),
  'F1 both seats get the same 10 opening films in the same order'
);
select is(
  (select bool_and(x.sources = array_fill('opening'::text, array[10])) from (
     select (select array_agg(o.source::text) from (
               select e.source from public.deck_entries e where e.room_member_id = m.id
               order by e.sort_key limit 10) o) as sources
     from public.room_members m where m.room_id = tests.room_id()) x),
  true,
  'F1 each seat''s 10 lowest entries are opening cards'
);
select is(
  (select bool_and(x.n = 10) from (
     select count(*) filter (where e.source = 'opening') as n
     from public.deck_entries e where e.room_id = tests.room_id() group by e.room_member_id) x),
  true,
  'F1 no seat has more than the 10 opening cards marked opening'
);
select is(
  (select count(*) from public.deck_entries e where e.room_id = tests.room_id() and e.source not in ('opening', 'ranked')),
  0::bigint,
  'F1 every card after the opening is ranked'
);
select is(
  (select count(*) from public.deck_entries e
   where e.room_id = tests.room_id()
     and e.title_id not in (select t.id from public.titles t where t.original_title like 'Catalog Film %')),
  0::bigint,
  'F1 every baseline card is a film of the fixture catalog'
);

-- F3a: the start fallback is logged as one.
select is((select count(*) from rec.requests where room_id = tests.room_id()), 1::bigint,
  'F3a the baseline deal logged one request');
select is(
  (select q.kind || '/' || q.model_version || '/' || q.is_fallback::text || '/' || (q.room_member_id is null)::text
   from rec.requests q where q.room_id = tests.room_id()),
  'start/sql-baseline/true/true',
  'F3a the request is a start by sql-baseline, a fallback, for the whole room'
);

-- F2: a refill the server never answers is dealt the same way through request_cards.
select tests.deal_game(2, 'g');
select tests.vote_next('g1', 19);
select tests.authenticate_as('g1');
select is(
  (select (a->>'status') || '/' || (a->>'remaining') from (select api.request_cards(tests.room_id()) as a) x),
  'enough/6',
  'F2 with 6 cards left, request_cards answers enough'
);
select tests.clear_authentication();
select tests.vote_next('g1', 1);
-- The vote at 15 cards left already queued a refill; clear it to ask afresh.
update public.room_members set refill_requested_at = null where id = tests.member_id('g1');
select set_config('tests.refills', (
  select count(*)::text from tests.queued('deck_requests') q
  where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
    and (q->>'room_member_id')::uuid = tests.member_id('g1')), true);
select tests.authenticate_as('g1');
select is((select api.request_cards(tests.room_id())->>'status'), 'queued',
  'F2 with 5 cards left, request_cards answers queued');
select tests.clear_authentication();
select is(
  (select count(*)::text from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
     and (q->>'room_member_id')::uuid = tests.member_id('g1')),
  (current_setting('tests.refills')::int + 1)::text,
  'F2 request_cards queued one more refill for the seat'
);
select is((select m.refill_requested_at is not null from public.room_members m where m.id = tests.member_id('g1')), true,
  'F2 request_cards set the refill flag');
select tests.authenticate_as('g1');
select is((select api.request_cards(tests.room_id())->>'status'), 'queued',
  'F2 a second call answers queued');
select tests.clear_authentication();
select is(
  (select count(*)::text from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
     and (q->>'room_member_id')::uuid = tests.member_id('g1')),
  (current_setting('tests.refills')::int + 1)::text,
  'F2 the second call queued nothing more'
);

update public.room_members set refill_requested_at = now() - interval '7 seconds' where id = tests.member_id('g1');
select tests.authenticate_as('g1');
select is((select api.request_cards(tests.room_id())->>'status'), 'queued',
  'F2 after 7 seconds without an answer, request_cards still answers queued');
select tests.clear_authentication();

update public.room_members set refill_requested_at = now() - interval '9 seconds' where id = tests.member_id('g1');
select tests.authenticate_as('g1');
select is(
  (select (a->>'status') || '/' || (a->>'fallback') from (select api.request_cards(tests.room_id()) as a) x),
  'ok/true',
  'F2 after 9 seconds without an answer, request_cards deals the baseline: ok, fallback'
);
select tests.clear_authentication();
select cmp_ok(
  (select count(*) from public.deck_entries e
   where e.room_member_id = tests.member_id('g1')
     and not exists (select 1 from public.votes v where v.room_member_id = e.room_member_id and v.title_id = e.title_id)),
  '>', 5::bigint,
  'F2 the seat has more than 5 upcoming cards after the baseline refill'
);
select cmp_ok(
  (select count(*) from public.deck_entries e
   where e.room_member_id = tests.member_id('g1')
     and e.request_id = (select max(q.id) from rec.requests q where q.room_id = tests.room_id())),
  '>=', 1::bigint,
  'F2 the baseline refill added cards to the seat'
);
select is(
  (select count(*) from public.deck_entries e
   where e.room_member_id = tests.member_id('g1')
     and e.request_id = (select max(q.id) from rec.requests q where q.room_id = tests.room_id())
     and e.source <> 'ranked'),
  0::bigint,
  'F2 every card the baseline refill added is ranked'
);
select is((select m.refill_requested_at is null from public.room_members m where m.id = tests.member_id('g1')), true,
  'F2 the baseline refill cleared the flag');
select is(
  (select count(*) from public.deck_entries e
   where e.room_member_id = tests.member_id('g2')
     and not exists (select 1 from public.votes v where v.room_member_id = e.room_member_id and v.title_id = e.title_id)),
  25::bigint,
  'F2 the other seat still has all 25 upcoming cards'
);

-- F3b: the refill fallback is logged as one, and the server's own start is not.
select is(
  (select q.kind || '/' || (q.room_member_id = tests.member_id('g1'))::text || '/' || q.model_version || '/' || q.is_fallback::text
   from rec.requests q where q.room_id = tests.room_id() order by q.id desc limit 1),
  'refill/true/sql-baseline/true',
  'F3b the newest request is a refill for the seat by sql-baseline, a fallback'
);
select is(
  (select q.kind || '/' || q.is_fallback::text from rec.requests q
   where q.room_id = tests.room_id() and q.model_version = 'test-ranker'),
  'start/false',
  'F3b the server''s own start request is not a fallback (the control)'
);

select * from finish();
rollback;

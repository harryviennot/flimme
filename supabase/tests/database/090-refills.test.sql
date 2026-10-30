-- Refills: when the vote asks the server for more cards, and what a re-rank keeps
-- (data-model.md#like-propagation-and-refills). The 15 cards and the keep of 3 are
-- starting values, tested as the docs state them. R4b is beyond the 120 checks of
-- data-model.md#what-was-tested.
--
-- Only the first seat votes, and always nopes, so no seat reaches the card count
-- of the finale and no match or propagation happens.

begin;
select plan(14);

select tests.create_catalog(60);
select tests.deal_game(2);

-- A seat's upcoming cards (dealt, not voted yet), in deck order.
create temp view upcoming as
select e.room_member_id, e.title_id, e.sort_key, e.source
from public.deck_entries e
where not exists (select 1 from public.votes v where v.room_member_id = e.room_member_id and v.title_id = e.title_id);

-- Films 26 to 35 as the server's pool and as one seat's new ranked cards.
select set_config('tests.new_pool', (
  select jsonb_agg(jsonb_build_object(
    'title_id', tests.title_id('Catalog Film ' || lpad(n::text, 3, '0')), 'group_score', 4.0 - n / 100.0, 'min_fit', 3,
    'fits', '{}'::jsonb, 'source', 'ranked', 'reason_code', 'runtime_fit', 'reason_params', '{}'::jsonb,
    'member_ratings', '[]'::jsonb) order by n)::text
  from generate_series(26, 35) n), true);
select set_config('tests.new_cards', (
  select jsonb_agg(jsonb_build_object(
    'title_id', tests.title_id('Catalog Film ' || lpad(n::text, 3, '0')), 'source', 'ranked',
    'score', 4.0 - n / 100.0, 'explore', false, 'propensity', 0.5, 'features', '{}'::jsonb) order by n)::text
  from generate_series(26, 35) n), true);

-- R1: no refill at 16 cards left.
select tests.vote_next('p1', 9);
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
     and (q->>'room_member_id')::uuid = tests.member_id('p1')),
  0::bigint,
  'R1 no refill is queued at 16 cards left'
);
select is((select m.refill_requested_at is null from public.room_members m where m.id = tests.member_id('p1')), true,
  'R1 the refill flag is not set at 16 cards left');

-- R2: exactly one refill at 15.
select tests.vote_next('p1', 1);
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
     and (q->>'room_member_id')::uuid = tests.member_id('p1')),
  1::bigint,
  'R2 exactly one refill is queued at 15 cards left'
);
select is((select m.refill_requested_at is not null from public.room_members m where m.id = tests.member_id('p1')), true,
  'R2 the refill flag is set at 15 cards left');

-- R3: no repeat at 14.
select tests.vote_next('p1', 1);
select is(
  (select count(*) from tests.queued('deck_requests') q
   where (q->>'room_id')::uuid = tests.room_id() and q->>'kind' = 'refill'
     and (q->>'room_member_id')::uuid = tests.member_id('p1')),
  1::bigint,
  'R3 no second refill is queued at 14 cards left'
);

-- R4: the re-rank keeps the 3 mounted cards, then the new ranking follows.
select set_config('tests.kept', (
  select array_agg(u.title_id order by u.sort_key)::text from (
    select title_id, sort_key from upcoming where room_member_id = tests.member_id('p1') order by sort_key limit 3) u), true);
select tests.act_as_server();
select is(
  (select (a->>'status') || '/' || (a->>'started') || '/' || (a->>'seats') from (
     select internal.deal_cards(tests.room_id(), jsonb_build_object(
       'request', jsonb_build_object('kind', 'refill', 'room_member_id', tests.member_id('p1'), 'model_version', 'test-ranker'),
       'pool', current_setting('tests.new_pool')::jsonb,
       'decks', jsonb_build_array(jsonb_build_object(
         'room_member_id', tests.member_id('p1'), 'keep', 3, 'cards', current_setting('tests.new_cards')::jsonb)))) as a) x),
  'ok/false/1',
  'R4 the re-rank answers ok, does not start a game, and touched 1 seat'
);
select tests.clear_authentication();
select is(
  (select array_agg(u.title_id order by u.sort_key) from (
     select title_id, sort_key from upcoming where room_member_id = tests.member_id('p1') order by sort_key limit 3) u),
  current_setting('tests.kept')::bigint[],
  'R4 the first 3 upcoming cards are the 3 that were mounted, in order'
);
select is(
  (select array_agg(u.title_id order by u.sort_key) from (
     select title_id, sort_key from upcoming where room_member_id = tests.member_id('p1') order by sort_key offset 3) u),
  (select array_agg(tests.title_id('Catalog Film ' || lpad(n::text, 3, '0')) order by n) from generate_series(26, 35) n),
  'R4 after them come films 26 to 35 in the new ranking''s order, and nothing else'
);
select is((select count(*) from upcoming where room_member_id = tests.member_id('p2')), 25::bigint,
  'R4 the other seat still has all 25 upcoming cards');

-- R5, R6: 13 upcoming, and the flag is cleared.
select is((select count(*) from upcoming where room_member_id = tests.member_id('p1')), 13::bigint,
  'R5 the re-rank leaves 13 upcoming cards: 3 kept and 10 new');
select is((select m.refill_requested_at is null from public.room_members m where m.id = tests.member_id('p1')), true,
  'R6 the re-rank clears the refill flag');

-- R7: deck_updated names the re-ranked seat only.
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'deck_updated') b
   where (b->'member_ids') ? tests.member_id('p1')::text and not ((b->'member_ids') ? tests.member_id('p2')::text)),
  1::bigint,
  'R7 one deck_updated broadcast names the first seat and not the second'
);

-- R4b (beyond the 120): a card moved up by a like stays through a re-rank.
select tests.deal_game(2, 'q');
update public.deck_entries e set source = 'propagated'
where e.room_member_id = tests.member_id('q1')
  and e.title_id = (select u.title_id from upcoming u where u.room_member_id = tests.member_id('q1')
                    order by u.sort_key offset 7 limit 1);
select set_config('tests.moved', (select u.title_id::text from upcoming u
  where u.room_member_id = tests.member_id('q1') and u.source = 'propagated'), true);
select tests.act_as_server();
select internal.deal_cards(tests.room_id(), jsonb_build_object(
  'request', jsonb_build_object('kind', 'refill', 'room_member_id', tests.member_id('q1'), 'model_version', 'test-ranker'),
  'pool', current_setting('tests.new_pool')::jsonb,
  'decks', jsonb_build_array(jsonb_build_object(
    'room_member_id', tests.member_id('q1'), 'keep', 3, 'cards', current_setting('tests.new_cards')::jsonb))));
select tests.clear_authentication();
select is((select count(*) from upcoming where room_member_id = tests.member_id('q1')), 14::bigint,
  'R4b (beyond the 120) the re-rank leaves 14 upcoming: 3 kept, 1 moved up by a like, 10 new');
select is(
  (select count(*) from upcoming u
   where u.room_member_id = tests.member_id('q1') and u.source = 'propagated'
     and u.title_id = current_setting('tests.moved')::bigint),
  1::bigint,
  'R4b (beyond the 120) the card moved up by a like is still in the deck');

select * from finish();
rollback;

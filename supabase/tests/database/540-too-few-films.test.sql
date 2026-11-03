-- M5.5: fewer than 20 eligible films at the start sends the room back to the
-- lobby with the reason (game-modes.md#how-a-game-ends, #starting-values).
-- deal_cards is the only writer of decks, so the rule lives there and holds for
-- the SQL deal and for the deck worker. Made-up films only.

begin;
select plan(21);

select tests.create_provider(9101, 'Few A');
select tests.create_provider(9102, 'Few B');
select tests.create_provider(9103, 'Few C');
select tests.create_provider(9104, 'Few D');
select tests.create_provider(9105, 'Few E');
select tests.create_provider(9106, 'Few F');
select tests.create_catalog(12, 9101);   -- films 1 to 12
select tests.create_catalog(19, 9102);   -- films 1 to 19
select tests.create_catalog(20, 9103);   -- films 1 to 20
select tests.create_catalog(30, 9104);   -- films 1 to 30
select tests.create_catalog(12, 9105);
select tests.create_catalog(12, 9106);
select tests.use_deck_engine('sql');

-- A room of two players on one service, in the lobby. Returns {room_id, ...}.
create function pg_temp.room(p_prefix text, p_providers integer[]) returns jsonb
language plpgsql
as $$
declare v_room jsonb;
begin
  v_room := tests.create_room(2, 'quick_match', 'FR', p_prefix);
  update public.rooms set provider_ids = p_providers where id = (v_room->>'room_id')::uuid;
  return v_room;
end
$$;

create function pg_temp.start(p_prefix text, p_room uuid) returns jsonb
language plpgsql
as $$
declare v_answer jsonb;
begin
  perform tests.authenticate_as(p_prefix || '1');
  v_answer := api.start_game(p_room);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

-- 1: 12 eligible films.
select set_config('tests.a', pg_temp.room('a', '{9101}')::text, true);
select set_config('tests.a_answer', pg_temp.start('a', (current_setting('tests.a')::jsonb->>'room_id')::uuid)::text, true);
select is(current_setting('tests.a_answer')::jsonb, jsonb_build_object('status', 'too_few_films', 'eligible', 12),
  'T1 a room whose services have 12 films answers too_few_films with eligible 12');

-- 2: back to the lobby, nothing dealt.
select is((select r.state::text || '/' || (r.dealing_at is null)::text from public.rooms r
           where r.id = (current_setting('tests.a')::jsonb->>'room_id')::uuid), 'lobby/true',
  'T2 the room is back in the lobby with dealing_at cleared');
select is(
  (select (select count(*) from public.room_cards where room_id = x.id)
        + (select count(*) from public.deck_entries where room_id = x.id)
        + (select count(*) from rec.request_items i join rec.requests q on q.id = i.request_id where q.room_id = x.id)
   from (select (current_setting('tests.a')::jsonb->>'room_id')::uuid as id) x),
  0::bigint, 'T2 no room_cards, deck_entries or request_items were written');

-- 3: the attempt is logged.
select is((select count(*) from rec.requests q where q.room_id = (current_setting('tests.a')::jsonb->>'room_id')::uuid),
  1::bigint, 'T3 one rec.requests row for the attempt');
select is((select q.kind || '/' || q.candidates from rec.requests q
           where q.room_id = (current_setting('tests.a')::jsonb->>'room_id')::uuid), 'start/12',
  'T3 the row is kind start with candidates 12');

-- 4: the broadcast carries the reason.
select is(
  (select count(*) from tests.broadcasts((current_setting('tests.a')::jsonb->>'room_id')::uuid, 'state_changed') b
   where b->>'state' = 'lobby' and b->>'reason' = 'too_few_films' and (b->>'eligible')::int = 12),
  1::bigint, 'T4 state_changed says lobby, too_few_films, eligible 12');

-- the host can start again at once, same filters, same answer
select is(pg_temp.start('a', (current_setting('tests.a')::jsonb->>'room_id')::uuid),
  jsonb_build_object('status', 'too_few_films', 'eligible', 12),
  'T4 a second start with the same filters gives the same answer');

-- 5: the edge, 19 and 20.
select set_config('tests.b', pg_temp.room('b', '{9102}')::text, true);
select is(pg_temp.start('b', (current_setting('tests.b')::jsonb->>'room_id')::uuid),
  jsonb_build_object('status', 'too_few_films', 'eligible', 19), 'T5 19 eligible films: too_few_films');
select set_config('tests.c', pg_temp.room('c', '{9103}')::text, true);
select set_config('tests.c_answer', pg_temp.start('c', (current_setting('tests.c')::jsonb->>'room_id')::uuid)::text, true);
select is(current_setting('tests.c_answer')::jsonb->>'status', 'ok', 'T5 exactly 20 eligible films: the game starts');
select is((select r.state::text from public.rooms r where r.id = (current_setting('tests.c')::jsonb->>'room_id')::uuid),
  'swiping', 'T5 and the room is swiping');

-- 6: the host widens the filter and starts again.
update public.rooms set provider_ids = '{9104}' where id = (current_setting('tests.a')::jsonb->>'room_id')::uuid;
select is(pg_temp.start('a', (current_setting('tests.a')::jsonb->>'room_id')::uuid)->>'status', 'ok',
  'T6 after adding films (30 fit), starting again works');
select is((select r.state::text from public.rooms r where r.id = (current_setting('tests.a')::jsonb->>'room_id')::uuid),
  'swiping', 'T6 and the room is swiping');

-- 7: the server's own deal, with candidates 5.
select tests.use_deck_engine('server');
select set_config('tests.d', pg_temp.room('d', '{9105}')::text, true);
select is(pg_temp.start('d', (current_setting('tests.d')::jsonb->>'room_id')::uuid)->>'status', 'dealing',
  'T7 under the server engine the start waits for the deck worker');
select tests.act_as_server();
select set_config('tests.d_answer', internal.deal_cards((current_setting('tests.d')::jsonb->>'room_id')::uuid,
  jsonb_build_object('request', jsonb_build_object('kind', 'start', 'model_version', 'test-ranker', 'candidates', 5),
                     'pool', '[]'::jsonb, 'decks', '[]'::jsonb))::text, true);
select tests.clear_authentication();
select is(current_setting('tests.d_answer')::jsonb, jsonb_build_object('status', 'too_few_films', 'eligible', 5),
  'T7 deal_cards for a start with candidates 5 answers too_few_films');
select is((select r.state::text from public.rooms r where r.id = (current_setting('tests.d')::jsonb->>'room_id')::uuid),
  'lobby', 'T7 and the room is back in the lobby');

-- and with no candidates the pool size stands in
select set_config('tests.g', pg_temp.room('g', '{9101}')::text, true);
select pg_temp.start('g', (current_setting('tests.g')::jsonb->>'room_id')::uuid);
select tests.act_as_server();
select is(internal.deal_cards((current_setting('tests.g')::jsonb->>'room_id')::uuid,
  jsonb_build_object('request', jsonb_build_object('kind', 'start', 'model_version', 'test-ranker'),
                     'pool', (select jsonb_agg(jsonb_build_object('title_id', t.id, 'group_score', 4, 'min_fit', 3))
                              from (select id from public.titles where original_title like 'Catalog Film %' order by id limit 3) t),
                     'decks', '[]'::jsonb)),
  jsonb_build_object('status', 'too_few_films', 'eligible', 3),
  'T7 without candidates the size of the pool stands in');
select tests.clear_authentication();

-- 8: the second tap after 8 seconds.
select set_config('tests.e', pg_temp.room('e', '{9106}')::text, true);
select pg_temp.start('e', (current_setting('tests.e')::jsonb->>'room_id')::uuid);
update public.rooms set dealing_at = now() - interval '10 seconds' where id = (current_setting('tests.e')::jsonb->>'room_id')::uuid;
select set_config('tests.e_answer', pg_temp.start('e', (current_setting('tests.e')::jsonb->>'room_id')::uuid)::text, true);
select is(current_setting('tests.e_answer')::jsonb,
  jsonb_build_object('status', 'too_few_films', 'eligible', 12, 'fallback', true),
  'T8 the second tap after 8 seconds with 12 films answers too_few_films with fallback true');
select is((select r.state::text from public.rooms r where r.id = (current_setting('tests.e')::jsonb->>'room_id')::uuid),
  'lobby', 'T8 and the room is back in the lobby');

-- 9: a swiping room deals whatever there is.
select tests.create_catalog(25);
select set_config('tests.s', tests.deal_game(2, 's', 'swiping')::text, true);
select tests.act_as_server();
select set_config('tests.s_answer', internal.deal_cards((current_setting('tests.s')::jsonb->>'room_id')::uuid,
  jsonb_build_object('request', jsonb_build_object('kind', 'refill', 'model_version', 'test-ranker', 'candidates', 3),
                     'pool', '[]'::jsonb, 'decks', '[]'::jsonb))::text, true);
select tests.clear_authentication();
select is(current_setting('tests.s_answer')::jsonb->>'status', 'ok', 'T9 a refill with 3 candidates deals what there is');
select is((select r.state::text from public.rooms r where r.id = (current_setting('tests.s')::jsonb->>'room_id')::uuid),
  'swiping', 'T9 and the room stays swiping');
select tests.use_deck_engine('sql');
select is(internal.deal_baseline((current_setting('tests.s')::jsonb->>'room_id')::uuid,
  tests.member_id('s1', (current_setting('tests.s')::jsonb->>'room_id')::uuid))->>'status', 'ok',
  'T9 a late joiner or refill deal from the baseline never answers too_few_films');

select * from finish();
rollback;

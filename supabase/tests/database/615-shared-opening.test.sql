-- The shared opening: every seat in a room gets the same first 10 cards in the same order,
-- and cards 11 to 25 in the same order too (game-modes / deck-engine.md#the-shared-opening,
-- decisions Q2.1). Seats pick different services; fresh guests have seen nothing.

begin;
select plan(5);

select tests.use_deck_engine('sql');
select tests.create_catalog(60);
select tests.create_provider(9002, 'Second Service');
insert into public.title_availability (title_id, country, provider_id, kind)
select t.id, 'FR', 9002, 'subscription' from public.titles t where t.original_title like 'Catalog Film %' and t.id % 2 = 0;

select set_config('tests.game', tests.deal_game(3, 's', 'lobby')::text, true);
select tests.use_deck_engine('sql');
select set_config('tests.room', current_setting('tests.game')::jsonb->>'room_id', true);
update public.rooms set provider_ids = '{9001,9002}' where id = current_setting('tests.room')::uuid;

-- Seats differ: s1 has Netflix-like 9001, s2 has 9002, s3 has both.
select tests.authenticate_as('s1');
select api.set_seat_prefs(current_setting('tests.room')::uuid, '{9001}');
select tests.authenticate_as('s2');
select api.set_seat_prefs(current_setting('tests.room')::uuid, '{9002}');
select tests.authenticate_as('s3');
select api.set_seat_prefs(current_setting('tests.room')::uuid, '{9001,9002}');
select tests.authenticate_as('s1');
select is(api.start_game(current_setting('tests.room')::uuid)->>'status', 'ok', 'premise: the game starts');
select tests.clear_authentication();

select is(cardinality(tests.upcoming('s1')), 25, 'premise: 25 cards each');
select ok((tests.upcoming('s1'))[1:10] = (tests.upcoming('s2'))[1:10]
      and (tests.upcoming('s2'))[1:10] = (tests.upcoming('s3'))[1:10],
  'the first 10 cards are the same, in the same order, for every seat');
select ok((tests.upcoming('s1'))[11:25] = (tests.upcoming('s2'))[11:25]
      and (tests.upcoming('s2'))[11:25] = (tests.upcoming('s3'))[11:25],
  'cards 11 to 25 are in the same order for every seat');
select is((select count(distinct d.sort_key) from public.deck_entries d where d.room_member_id = tests.member_id('s1')),
  25::bigint, 'premise: sort keys are distinct');

select * from finish();
rollback;

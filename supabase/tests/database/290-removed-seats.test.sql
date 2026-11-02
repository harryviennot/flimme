-- M1.8: removed seats lose access, seats that left can't send (security.md gap 3,
-- data-model.md#who-sees-what). A removed seat is not a member at all. A seat
-- that left keeps reading (history, rejoining) but can't send on room:<id>:live.
-- Nothing sets removed_at until M4.2 (api.remove_member), so the tests set it
-- directly as the superuser.
-- realtime.send overwrites the transaction's topic, so every read and insert is
-- preceded by tests.use_topic.

begin;
select plan(27);

select tests.create_catalog(40);
-- p1 stays present, p2 is removed later, p3 leaves later; one match and one round to read.
select tests.deal_game(3);

insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
values (tests.room_id(), tests.film(1), 'majority', 2, 3, 1);
with r as (
  insert into public.rounds (room_id, kind, stage, stage_closes_at)
  values (tests.room_id(), 'final_cut', 'veto', now() + interval '1 minute') returning id
)
insert into public.round_candidates (round_id, title_id, seed) select r.id, tests.film(1), 1 from r;

-- Room B: p2 also hosts a room of their own, unaffected by p2's removal from room A.
create temp table room_a as select tests.room_id() as id;
grant select on room_a to authenticated;
select tests.authenticate_as('p2');
create temp table room_b as select (api.create_room('quick_match', 'FR')->>'room_id')::uuid as id;
grant select on room_b to authenticated;
select tests.clear_authentication();

-- A message on the live topic, sent while everyone is still present.
select tests.authenticate_as('p1');
select tests.use_topic('room:' || (select id from room_a) || ':live');
insert into realtime.messages (topic, extension, payload, event, private)
values ('room:' || (select id from room_a) || ':live', 'broadcast', '{"emoji": "x"}', 'reaction', true);

-- Control: before the removal p2 has next cards, and p1 reads all five views.
select tests.authenticate_as('p2');
select isnt(api.my_next_cards((select id from room_a)), '[]'::jsonb, 'control: a present seat has next cards');
select tests.authenticate_as('p1');
select ok(
  (select count(*) from api.rooms where id = (select id from room_a)) > 0
  and (select count(*) from api.room_seats where room_id = (select id from room_a)) > 0
  and (select count(*) from api.room_matches where room_id = (select id from room_a)) > 0
  and (select count(*) from api.rounds where room_id = (select id from room_a)) > 0
  and (select count(*) from api.round_candidates) > 0,
  'control: a present seat reads the room, seats, matches, rounds and candidates'
);

-- Remove p2, p3 leaves.
select tests.clear_authentication();
update public.room_members set removed_at = now() where id = tests.member_id('p2', (select id from room_a));
update public.room_members set left_at = now() where id = tests.member_id('p3', (select id from room_a));

-- T1: a removed seat reads nothing of the room.
select tests.authenticate_as('p2');
select is((select count(*) from api.rooms where id = (select id from room_a)), 0::bigint, 'T1 a removed seat reads no room');
select is((select count(*) from api.room_seats where room_id = (select id from room_a)), 0::bigint, 'T1 a removed seat reads no seats');
select is((select count(*) from api.room_matches where room_id = (select id from room_a)), 0::bigint, 'T1 a removed seat reads no matches');
select is((select count(*) from api.rounds where room_id = (select id from room_a)), 0::bigint, 'T1 a removed seat reads no rounds');
select is((select count(*) from api.round_candidates), 0::bigint, 'T1 a removed seat reads no round candidates');

-- T2: a removed seat gets no next cards.
select is(api.my_next_cards((select id from room_a)), '[]'::jsonb, 'T2 a removed seat has no next cards');

-- T3: a removed seat neither reads nor sends on either topic.
select tests.use_topic('room:' || (select id from room_a));
select is((select count(*) from realtime.messages where topic = 'room:' || (select id from room_a)), 0::bigint,
  'T3 a removed seat reads nothing on the room topic');
select tests.use_topic('room:' || (select id from room_a) || ':live');
select is((select count(*) from realtime.messages where topic = 'room:' || (select id from room_a) || ':live'), 0::bigint,
  'T3 a removed seat reads nothing on the live topic');
select tests.use_topic('room:' || (select id from room_a));
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || (select id from room_a), 'broadcast', '{}', 'match', true)$$,
  '42501', null, 'T3 a removed seat cannot send on the room topic');
select tests.use_topic('room:' || (select id from room_a) || ':live');
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || (select id from room_a) || ':live', 'broadcast', '{}', 'reaction', true)$$,
  '42501', null, 'T3 a removed seat cannot send on the live topic');

-- T7: the removed player's other room is unaffected.
select is((select count(*) from api.rooms where id = (select id from room_b)), 1::bigint,
  'T7 the removed player still reads their other room');
select tests.use_topic('room:' || (select id from room_b) || ':live');
select lives_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || (select id from room_b) || ':live', 'broadcast', '{}', 'reaction', true)$$,
  'T7 the removed player still sends on their other room''s live topic');

-- T8: is_room_member, for the removed seat and (below) the seat that left.
select is(internal.is_room_member((select id from room_a)), false, 'T8 is_room_member is false for a removed seat');

-- T4: a seat that left still reads the room, seats and matches, and both topics.
select tests.authenticate_as('p3');
select is((select count(*) from api.rooms where id = (select id from room_a)), 1::bigint, 'T4 a seat that left reads the room');
select is((select count(*) from api.room_seats where room_id = (select id from room_a)), 3::bigint, 'T4 a seat that left reads the seats');
select is((select count(*) from api.room_matches where room_id = (select id from room_a)), 1::bigint, 'T4 a seat that left reads the matches');
select tests.use_topic('room:' || (select id from room_a));
select cmp_ok((select count(*) from realtime.messages where topic = 'room:' || (select id from room_a)), '>=', 1::bigint,
  'T4 a seat that left reads the room topic');
select tests.use_topic('room:' || (select id from room_a) || ':live');
select cmp_ok((select count(*) from realtime.messages where topic = 'room:' || (select id from room_a) || ':live'), '>=', 1::bigint,
  'T4 a seat that left reads the live topic');
select is(internal.is_room_member((select id from room_a)), true, 'T8 is_room_member is true for a seat that left');

-- T5: a seat that left can't send on the live topic.
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || (select id from room_a) || ':live', 'broadcast', '{}', 'reaction', true)$$,
  '42501', null, 'T5 a seat that left cannot send on the live topic');

-- T6: a present seat reads and sends on the live topic and can't send on the room topic.
select tests.authenticate_as('p1');
select tests.use_topic('room:' || (select id from room_a) || ':live');
select cmp_ok((select count(*) from realtime.messages where topic = 'room:' || (select id from room_a) || ':live'), '>=', 1::bigint,
  'T6 a present seat reads the live topic');
select lives_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || (select id from room_a) || ':live', 'broadcast', '{}', 'reaction', true)$$,
  'T6 a present seat sends on the live topic');
select tests.use_topic('room:' || (select id from room_a));
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || (select id from room_a), 'broadcast', '{}', 'match', true)$$,
  '42501', null, 'T6 a present seat cannot send on the room topic');
select is(internal.is_room_member((select id from room_a)), true, 'T8 is_room_member is true for a present seat');

-- The column is nullable with no default, so only a deliberate write removes a seat.
select tests.clear_authentication();
select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'room_members' and column_name = 'removed_at'
     and is_nullable = 'YES' and column_default is null),
  1::bigint, 'the removed_at column is nullable with no default');

select * from finish();
rollback;

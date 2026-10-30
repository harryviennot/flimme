-- Who may read and send on a room's Realtime topics (data-model.md#who-sees-what):
-- seated players read room:<id>, and read and send on room:<id>:live; nobody
-- sends on room:<id>. Delivery over websockets needs the real stack and is not
-- tested here: these tests check the policies on realtime.messages.
-- realtime.send overwrites the transaction's topic, so every read and insert
-- is preceded by tests.use_topic.

begin;
select plan(7);

-- Setup: a room of p1 and p2 (the member_joined row exists) and a stranger carol.
select tests.create_room(2);
select tests.create_player('carol');

-- T1: a seated player reads the server topic.
select tests.authenticate_as('p2');
select tests.use_topic('room:' || tests.room_id());
select cmp_ok(
  (select count(*) from realtime.messages where topic = 'room:' || tests.room_id()), '>=', 1::bigint,
  'T1 a seated player reads the room topic'
);

-- T2: nobody sends on the server topic, so a fake match cannot appear there.
select tests.use_topic('room:' || tests.room_id());
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || tests.room_id(), 'broadcast', '{"title_id": 1}', 'match', true)$$,
  '42501', null,
  'T2 a seated player cannot send on the room topic'
);

-- T3: a seated player sends on the live topic.
select tests.authenticate_as('p1');
select tests.use_topic('room:' || tests.room_id() || ':live');
select lives_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || tests.room_id() || ':live', 'broadcast', '{"emoji": "x"}', 'reaction', true)$$,
  'T3 a seated player sends on the live topic'
);

-- T1 again: another seated player reads what was sent on the live topic.
select tests.authenticate_as('p2');
select tests.use_topic('room:' || tests.room_id() || ':live');
select is(
  (select count(*) from realtime.messages
   where topic = 'room:' || tests.room_id() || ':live' and event = 'reaction'),
  1::bigint,
  'T1 a seated player reads the live topic'
);

-- T4: a stranger reads nothing and sends nothing (T1 is the positive control).
select tests.authenticate_as('carol');
select tests.use_topic('room:' || tests.room_id());
select is(
  (select count(*) from realtime.messages where topic = 'room:' || tests.room_id()), 0::bigint,
  'T4 a stranger reads nothing on the room topic'
);
select tests.use_topic('room:' || tests.room_id() || ':live');
select is(
  (select count(*) from realtime.messages where topic = 'room:' || tests.room_id() || ':live'), 0::bigint,
  'T4 a stranger reads nothing on the live topic'
);
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values ('room:' || tests.room_id() || ':live', 'broadcast', '{"emoji": "x"}', 'reaction', true)$$,
  '42501', null,
  'T4 a stranger cannot send on the live topic'
);

select * from finish();
rollback;

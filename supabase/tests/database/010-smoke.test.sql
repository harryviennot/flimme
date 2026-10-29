-- Smoke test: the schema is loaded, a guest can create a room through the api,
-- another guest can join it by its code, and a stranger cannot see it.
-- Runs on the lite database and on the real stack.

begin;
select plan(16);

-- The three schemas the design is built on.
select has_schema('api', 'schema api exists');
select has_schema('internal', 'schema internal exists');
select has_schema('rec', 'schema rec exists');

-- Three guests: alice hosts, bob joins, carol is a stranger.
select tests.create_player('alice');
select tests.create_player('bob');
select tests.create_player('carol');

-- A guest creates a room and gets an ok answer: {status, room_id, code}.
select tests.authenticate_as('alice');
select set_config('smoke.created', api.create_room('quick_match', 'FR')::text, true);
select is(current_setting('smoke.created')::jsonb ->> 'status', 'ok', 'a guest creates a room and gets ok');
select matches(current_setting('smoke.created')::jsonb ->> 'code', '^[0-9]{6}$', 'the answer carries a 6-digit code');
select is(
  (select r.id from api.rooms r),
  (current_setting('smoke.created')::jsonb ->> 'room_id')::uuid,
  'the host sees the room she created'
);
select is((select r.state::text from api.rooms r), 'lobby', 'the new room is in the lobby');
select is(
  (select s.role::text from api.room_seats s where s.is_me),
  'host',
  'the host holds the host seat'
);

-- A second guest joins by code: {status, room_id, member_id, state, rejoined}.
select tests.authenticate_as('bob');
select set_config(
  'smoke.joined',
  api.join_room(current_setting('smoke.created')::jsonb ->> 'code')::text,
  true
);
select is(current_setting('smoke.joined')::jsonb ->> 'status', 'ok', 'a second guest joins by code and gets ok');
select is(
  (current_setting('smoke.joined')::jsonb ->> 'rejoined')::boolean,
  false,
  'joining for the first time is not a rejoin'
);
select is(
  (select count(*) from api.room_seats),
  2::bigint,
  'a member sees both seats'
);

-- A non-member cannot read the room, and a wrong code is an answer, not an error.
select tests.authenticate_as('carol');
select is((select count(*) from api.rooms), 0::bigint, 'a non-member sees no room through api.rooms');
select is((select count(*) from api.room_seats), 0::bigint, 'a non-member sees no seats');
select is((select count(*) from public.rooms), 0::bigint, 'a non-member sees no room in the table either');
select is(
  api.join_room('000000') ->> 'status',
  'not_found',
  'a wrong code answers not_found'
);

-- The project's public key alone gets nowhere: the api is for signed-in users.
select tests.authenticate_as_anon();
select throws_ok(
  $$ select api.create_room() $$,
  '42501',
  null,
  'a caller with no sign-in cannot reach the api schema'
);

select * from finish();
rollback;

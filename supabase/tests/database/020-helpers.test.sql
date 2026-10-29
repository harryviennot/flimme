-- The helpers in 000-helpers.sql, checked against the real api functions.
-- Runs on the lite database and on the real stack.

begin;
select plan(9);

select tests.create_room(3);
select is(tests.room_code() ~ '^[0-9]{6}$', true, 'create_room remembers the room code');
select is(
  (select count(*) from public.room_members where room_id = tests.room_id() and left_at is null),
  3::bigint,
  'create_room(3) seats three players'
);
select is(
  (select m.role::text from public.room_members m where m.id = tests.member_id('p1')),
  'host',
  'p1 holds the host seat'
);
select is(
  (select m.role::text from public.room_members m where m.id = tests.member_id('p3')),
  'guest',
  'p3 holds a guest seat'
);
select is(
  (select p.display_name from public.profiles p where p.id = tests.uid('p2')),
  'p2',
  'players are named after their handle'
);

-- Acting as a player, and switching to another one directly.
select tests.authenticate_as('p3');
select is((select count(*) from api.room_seats), 3::bigint, 'as p3, all three seats are visible');
select is(auth.uid(), tests.uid('p3'), 'as p3, auth.uid() is p3');
select tests.authenticate_as('p2');
select is(auth.uid(), tests.uid('p2'), 'switching players needs no clear_authentication in between');

-- Back to the superuser.
select tests.clear_authentication();
select is(auth.uid(), null::uuid, 'after clear_authentication, nobody is signed in');

select * from finish();
rollback;

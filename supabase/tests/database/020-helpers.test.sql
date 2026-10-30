-- The helpers in 000-helpers.sql, checked against the real api functions.
-- Runs on the lite database and on the real stack.

begin;
select plan(16);

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

-- Catalog and Realtime fixtures.
select tests.create_title('Test Film One');
select is(
  (select t.original_title || '/' || t.media_type::text || '/' || t.is_active::text
   from public.titles t where t.id = tests.title_id('Test Film One')),
  'Test Film One/movie/true',
  'create_title makes an active movie that title_id finds by name'
);
select is(tests.create_title('Test Film Two') <> tests.title_id('Test Film One'), true,
  'two names make two different films');
select is(tests.create_provider(9001, 'Test Service A'), 9001, 'create_provider returns the id');
select is(
  (select count(*) from public.provider_regions where provider_id = 9001 and country = 'FR'),
  1::bigint,
  'create_provider makes the service available in the country, adding the country if missing'
);
select tests.create_provider(9001, 'Test Service A renamed');
select is(
  (select p.name || '/' || (select count(*) from public.provider_regions r where r.provider_id = 9001)
   from public.providers p where p.id = 9001),
  'Test Service A renamed/1',
  'create_provider again renames the service and adds no second region'
);

select tests.use_topic('room:' || tests.room_id());
select is(current_setting('realtime.topic'), 'room:' || tests.room_id(), 'use_topic sets the topic of the request');
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'member_joined')),
  2::bigint,
  'broadcasts returns the member_joined payloads of the room made above (p2 and p3 joined)'
);

select * from finish();
rollback;

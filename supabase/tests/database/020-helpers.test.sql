-- The helpers in 000-helpers.sql, checked against the real api functions.
-- Runs on the lite database and on the real stack.

begin;
select plan(36);

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

-- Server and deck fixtures. These make rooms of their own, so they come after
-- the checks above, which read the first room through tests.room_id().
select is(cardinality(tests.create_catalog(30)), 30, 'create_catalog(30) returns 30 film ids');
select is((tests.create_catalog(30))[1], tests.title_id('Catalog Film 001'),
  'create_catalog returns the ids in number order, and a second call skips the existing films');
select is(
  (select count(*) from public.titles t
   join public.title_availability a on a.title_id = t.id and a.provider_id = 9001
        and a.country = 'FR' and a.kind = 'subscription'
   join public.title_vectors v on v.title_id = t.id
   where t.original_title like 'Catalog Film %'),
  30::bigint,
  'create_catalog gives every film a subscription row for the service in the country, and a vector'
);
select is(
  (select bool_and(x.popularity < x.previous) from (
     select t.popularity, lag(t.popularity) over (order by t.original_title) as previous
     from public.titles t where t.original_title like 'Catalog Film %') x
   where x.previous is not null),
  true,
  'create_catalog gives each film a lower popularity than the one before'
);
select is(cardinality(tests.create_catalog(32)), 32, 'create_catalog(32) after create_catalog(30) returns 32 ids');
select is((select count(*) from public.titles where original_title like 'Catalog Film %'), 32::bigint,
  'create_catalog(32) only added the two missing films');

select tests.act_as_server();
select is(current_user::text, 'app_server', 'act_as_server acts as the app_server role');
select is(nullif(current_setting('request.jwt.claims', true), ''), null, 'act_as_server sends no claims, so nobody is signed in');
select tests.clear_authentication();
select isnt(current_user::text, 'app_server', 'clear_authentication leaves the server role');

select tests.deal_game(2, 'l', 'lobby');
select is(
  (select r.state::text || '/' || (select count(*) from public.room_members m where m.room_id = r.id)
          || '/' || (select count(*) from public.room_members m where m.room_id = r.id and m.provider_ids = '{9001}')
   from public.rooms r where r.id = tests.room_id()),
  'lobby/2/2',
  'deal_game(until lobby) seats two players with service 9001 and stops in the lobby'
);

select tests.deal_game(2, 'w', 'dealing');
select is(
  (select r.state::text || '/' || (select count(*) from tests.queued('deck_requests') q
                                   where (q->>'room_id')::uuid = r.id and q->>'kind' = 'start')
   from public.rooms r where r.id = tests.room_id()),
  'dealing/1',
  'deal_game(until dealing) starts the game and queues one start request, which tests.queued reads'
);

select tests.deal_game(2, 'd');
select is(
  (select r.state::text || '/' || (select count(*) from public.deck_entries e
                                   where e.room_member_id = tests.member_id('d1'))
          || '/' || (select count(*) from public.deck_entries e where e.room_member_id = tests.member_id('d2'))
   from public.rooms r where r.id = tests.room_id()),
  'swiping/25/25',
  'deal_game deals 25 cards to each seat and the room is swiping'
);
select is(
  (current_user = session_user and auth.uid() is null),
  true,
  'deal_game leaves the session as the superuser'
);

select is(tests.vote_next('d1', 3)->>'status', 'ok', 'vote_next answers the last vote''s status');
select is(
  (select m.swipe_count from public.room_members m where m.id = tests.member_id('d1')),
  3,
  'vote_next cast three votes for the player'
);

-- Game fixtures. Each makes or uses a room of its own, so they come last.
select tests.deal_game(3, 'fc', 'swiping', 'final_cut');
select is(
  (select r.mode || '/' || r.state::text || '/' || (jsonb_array_length(r.rule) = (select count(*) from public.match_rules mr where mr.mode = 'final_cut'))::text
   from public.rooms r where r.id = tests.room_id()),
  'final_cut/swiping/true',
  'deal_game(3, fc, swiping, final_cut) gives a Final Cut room in swiping whose rule has one element per final_cut match rule'
);

select is(tests.film(7), tests.title_id('Catalog Film 007'), 'film(7) is the id of Catalog Film 007');

select is(tests.vote('fc1', 1)->>'status', 'ok', 'vote answers ok for a first like');
select is(tests.vote('fc1', 1)->>'status', 'duplicate', 'vote returns a duplicate answer instead of raising');
select is(
  (select array_agg(x) from unnest((tests.upcoming('fc1'))[1:3]) x),
  array[tests.film(2), tests.film(3), tests.film(4)],
  'upcoming lists the seat''s dealt films without a vote, in deck order (film 1 is voted, so it is left out)'
);

select * from finish();
rollback;

-- M1.11: input limits and codes that cannot be guessed (security.md#the-database-gaps-found,
-- gaps 8 to 10; security.md#starting-values: services per call 50). Harry's answers of 2 Nov 2026:
-- dwell 0 to 120,000 ms, client_at between the room's start and now, at most 50 services,
-- 3 moods and 3 genres (20 until M6.53), and a refusal (too_many) over a cap.

begin;
select plan(26);

select tests.create_catalog(40);
select tests.deal_game(2, 'q');

-- T1: 200 rooms, every code is six digits and the open ones are distinct.
select tests.create_player('host200');
select tests.authenticate_as('host200');
select api.create_room('quick_match', 'FR') from generate_series(1, 200);
select tests.clear_authentication();
select is(
  (select count(*) from public.rooms where host_id = tests.uid('host200') and code ~ '^[0-9]{6}$'),
  200::bigint,
  'T1 every one of 200 room codes is six digits'
);
select is(
  (select count(distinct code) from public.rooms
   where host_id = tests.uid('host200') and state in ('lobby', 'dealing', 'swiping', 'finale')),
  200::bigint,
  'T1 the 200 open room codes are distinct'
);

-- T2: the code generator draws from pgcrypto, never from random().
select ok(
  coalesce(pg_get_functiondef(to_regprocedure('internal.new_room_code()')) ~ 'gen_random_bytes', false),
  'T2 internal.new_room_code calls gen_random_bytes'
);
select ok(
  coalesce(pg_get_functiondef(to_regprocedure('internal.new_room_code()')) !~ 'random\(', false),
  'T2 internal.new_room_code does not call random('
);

-- T3: dwell is clamped to 0 to 120,000 ms.
select tests.authenticate_as('q1');
select api.cast_vote(tests.room_id(), tests.film(20), 'nope', null, -5, null);
select api.cast_vote(tests.room_id(), tests.film(19), 'nope', null, 10000000, null);
select api.cast_vote(tests.room_id(), tests.film(15), 'nope', null, null, null);
select tests.clear_authentication();
select is(
  (select dwell_ms from public.swipe_log where room_member_id = tests.member_id('q1') and title_id = tests.film(20)),
  0,
  'T3 a dwell of -5 ms is stored as 0'
);
select is(
  (select dwell_ms from public.swipe_log where room_member_id = tests.member_id('q1') and title_id = tests.film(19)),
  120000,
  'T3 a dwell of 10,000,000 ms is stored as 120,000'
);
select is(
  (select dwell_ms from public.swipe_log where room_member_id = tests.member_id('q1') and title_id = tests.film(15)),
  null::integer,
  'T3 a null dwell stays null'
);

-- T4: client_at is clamped between the room's start and now; null stays null.
-- (1 minute back: M6.1 gave 2-player rooms a 6-minute limit, and 10 minutes would end the game.)
update public.rooms set started_at = now() - interval '1 minute' where id = tests.room_id();
select tests.authenticate_as('q1');
select api.cast_vote(tests.room_id(), tests.film(18), 'nope', null, null, now() + interval '1 hour');
select api.cast_vote(tests.room_id(), tests.film(17), 'nope', null, null, now() - interval '1 hour');
select api.cast_vote(tests.room_id(), tests.film(16), 'nope', null, null, null);
select tests.clear_authentication();
select is(
  (select client_created_at from public.votes where room_member_id = tests.member_id('q1') and title_id = tests.film(18)),
  now(),
  'T4 a client time an hour in the future is stored as now'
);
select is(
  (select client_created_at from public.votes where room_member_id = tests.member_id('q1') and title_id = tests.film(17)),
  (select started_at from public.rooms where id = tests.room_id()),
  'T4 a client time before the room started is stored as the start'
);
select is(
  (select client_created_at from public.votes where room_member_id = tests.member_id('q1') and title_id = tests.film(16)),
  null::timestamptz,
  'T4 a null client time stays null'
);

-- T5: at most 50 services per call; nothing saved over the cap.
select tests.create_provider(70000 + n, 'Service ' || n) from generate_series(1, 51) n;
create temp table q1_services as select provider_ids from public.room_members where id = tests.member_id('q1');
grant select on q1_services to public;
select tests.authenticate_as('q1');
select is(
  api.set_seat_prefs(tests.room_id(), (select array_agg(70000 + n) from generate_series(1, 51) n)),
  jsonb_build_object('status', 'too_many', 'field', 'provider_ids', 'max', 50),
  'T5 51 services answer too_many'
);
select tests.clear_authentication();
select is(
  (select provider_ids from public.room_members where id = tests.member_id('q1')),
  (select provider_ids from q1_services),
  'T5 the seat is unchanged after too_many'
);
select tests.authenticate_as('q1');
select is(
  api.set_seat_prefs(tests.room_id(), (select array_agg(70000 + n) from generate_series(1, 50) n))->>'status',
  'ok',
  'T5 50 services are accepted'
);
select tests.clear_authentication();

-- T6: a service listed only in another country is dropped, also from the room.
select tests.create_provider(70100, 'Only in Germany', 'DE');
select tests.create_provider(70101, 'In France', 'FR');
select tests.authenticate_as('q2');
select is(
  api.set_seat_prefs(tests.room_id(), array[70100, 70101])->>'status',
  'ok',
  'T6 a seat that lists a foreign service is still answered ok'
);
select tests.clear_authentication();
select is(
  (select provider_ids from public.room_members where id = tests.member_id('q2')),
  array[70101],
  'T6 the foreign service is dropped from the seat'
);
select ok(
  (select 70100 <> all(provider_ids) from public.rooms where id = tests.room_id()),
  'T6 the foreign service does not reach rooms.provider_ids'
);

-- T7: at most 3 moods and 3 genres (M6.53, decisions 6 Nov 2026; it was 20).
select tests.authenticate_as('q1');
select is(
  api.set_seat_prefs(tests.room_id(), null, array['a', 'b', 'c', 'd']),
  jsonb_build_object('status', 'too_many', 'field', 'mood_slugs', 'max', 3),
  'T7 4 moods answer too_many'
);
select is(
  api.set_seat_prefs(tests.room_id(), null, null, (select array_agg(n) from generate_series(1, 4) n)),
  jsonb_build_object('status', 'too_many', 'field', 'genre_ids', 'max', 3),
  'T7 4 genres answer too_many'
);
-- M6.68: Not tonight is capped at 3 genres and 3 people a seat, refused whole.
select is(
  api.set_seat_skips(tests.room_id(), (select array_agg(n) from generate_series(1, 4) n)),
  jsonb_build_object('status', 'too_many', 'field', 'genre_ids', 'max', 3),
  'T7 4 skipped genres answer too_many'
);
select is(
  api.set_seat_skips(tests.room_id(), null, (select array_agg(n) from generate_series(1, 4) n)),
  jsonb_build_object('status', 'too_many', 'field', 'person_ids', 'max', 3),
  'T7 4 skipped people answer too_many'
);
select tests.clear_authentication();

-- T8: set_my_providers caps at 50 and drops unknown or foreign services.
select tests.authenticate_as('q1');
select is(
  api.set_my_providers((select array_agg(70000 + n) from generate_series(1, 51) n)),
  jsonb_build_object('status', 'too_many', 'max', 50),
  'T8 51 services answer too_many'
);
select is(
  api.set_my_providers(array[70101, 70100, 987654321])->>'status',
  'ok',
  'T8 an unknown and a foreign service are answered ok'
);
select tests.clear_authentication();
select is(
  (select array_agg(provider_id order by provider_id) from public.profile_providers where profile_id = tests.uid('q1')),
  array[70101],
  'T8 only the service listed in the profile''s country is kept'
);

-- T8: a null array changes nothing (the old behaviour), and a null country keeps any listed service.
select tests.authenticate_as('q1');
select is(api.set_my_providers(null)->>'status', 'ok', 'T8 a null array is answered ok');
select tests.clear_authentication();
select is(
  (select array_agg(provider_id order by provider_id) from public.profile_providers where profile_id = tests.uid('q1')),
  array[70101],
  'T8 a null array leaves the profile''s services unchanged'
);
update public.profiles set country = null where id = tests.uid('q2');
select tests.authenticate_as('q2');
select api.set_my_providers(array[70100, 70101, 987654321]);
select tests.clear_authentication();
select is(
  (select array_agg(provider_id order by provider_id) from public.profile_providers where profile_id = tests.uid('q2')),
  array[70100, 70101],
  'T8 with no country, any listed service is kept and an unknown one is dropped'
);

select * from finish();
rollback;

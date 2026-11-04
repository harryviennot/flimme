-- M6.7: starting to swipe moves expires_at to 1 hour after the start
-- (game-modes.md#how-a-game-ends, "The 1-hour limit"). A lobby keeps its 3-hour
-- expiry until then. Made-up films only.

begin;
select plan(7);

select tests.create_provider(9601, 'Limit A');
select tests.create_catalog(12, 9601);
select tests.create_catalog(30, 9001);

-- A lobby opened 2 h 59 min ago, dealt through deal_cards (the server's deal).
select set_config('tests.old', tests.deal_game(2, 'a', 'dealing')::text, true);
select set_config('tests.old_room', current_setting('tests.old')::jsonb->>'room_id', true);
update public.rooms set created_at = now() - interval '2 hours 59 minutes',
                        expires_at = now() + interval '1 minute'
where id = current_setting('tests.old_room')::uuid;
select internal.begin_swiping(current_setting('tests.old_room')::uuid);
select ok((select r.expires_at = r.started_at + interval '1 hour' and r.expires_at > now() + interval '59 minutes'
           from public.rooms r where r.id = current_setting('tests.old_room')::uuid),
  'a lobby opened 2 h 59 min ago expires 1 hour after the start');

-- Dealt by internal.deal_cards end to end.
select set_config('tests.srv', tests.deal_game(2, 'b')::text, true);
select ok((select r.expires_at = r.started_at + interval '1 hour' and r.expires_at > now()
           from public.rooms r where r.id = (current_setting('tests.srv')::jsonb->>'room_id')::uuid),
  'a room dealt by deal_cards expires 1 hour after the start');

-- Dealt through the SQL baseline.
select tests.use_deck_engine('sql');
select tests.create_room(2, 'quick_match', 'FR', 'd');
select set_config('tests.sql_room', tests.room_id()::text, true);
select tests.authenticate_as('d1');
select api.set_seat_prefs(current_setting('tests.sql_room')::uuid, '{9001}');
select tests.authenticate_as('d2');
select api.set_seat_prefs(current_setting('tests.sql_room')::uuid, '{9001}');
select tests.authenticate_as('d1');
select api.start_game(current_setting('tests.sql_room')::uuid);
select tests.clear_authentication();
select is((select r.state::text from public.rooms r where r.id = current_setting('tests.sql_room')::uuid),
  'swiping', 'premise: the SQL deal started the game');
select ok((select r.expires_at = r.started_at + interval '1 hour'
           from public.rooms r where r.id = current_setting('tests.sql_room')::uuid),
  'a room dealt through the SQL baseline expires 1 hour after the start');

-- Positive control: a new lobby.
select tests.create_room(2, 'quick_match', 'FR', 'e');
select is((select r.expires_at - r.created_at from public.rooms r where r.id = tests.room_id()),
  interval '3 hours', 'a new lobby expires 3 hours after creation');

-- A start refused with too_few_films keeps the lobby expiry.
select tests.create_room(2, 'quick_match', 'FR', 'f');
select set_config('tests.few_room', tests.room_id()::text, true);
update public.rooms set provider_ids = '{9601}' where id = current_setting('tests.few_room')::uuid;
select set_config('tests.few_before', (select expires_at::text from public.rooms where id = current_setting('tests.few_room')::uuid), true);
select tests.authenticate_as('f1');
select is(api.start_game(current_setting('tests.few_room')::uuid)->>'status', 'too_few_films',
  'premise: the start is refused with too_few_films');
select tests.clear_authentication();
select is((select r.expires_at::text from public.rooms r where r.id = current_setting('tests.few_room')::uuid),
  current_setting('tests.few_before'), 'a start refused with too_few_films leaves expires_at unchanged');

select * from finish();
rollback;

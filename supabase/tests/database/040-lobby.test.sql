-- Profiles, services, creating and joining a room, and the lobby's settings
-- (data-model.md#create-and-join and #lobby). Statuses are answers, not errors:
-- only access errors raise (42501). L4b and L4c are beyond the 120 checks of
-- data-model.md#what-was-tested: create-and-join also states `full` and `in_finale`.

begin;
select plan(40);

select tests.create_provider(9001, 'Test Service A');
select tests.create_provider(9002, 'Test Service B');

-- L1a: an invalid name is an answer and changes nothing.
select tests.create_player('namer');
select tests.authenticate_as('namer');
select is((select api.update_profile('')->>'status'), 'invalid_name', 'L1a an empty name answers invalid_name');
select is((select api.update_profile('   ')->>'status'), 'invalid_name', 'L1a a blank name answers invalid_name');
select is((select api.update_profile(repeat('x', 25))->>'status'), 'invalid_name',
  'L1a a name of 25 characters answers invalid_name');
select tests.clear_authentication();
select is((select display_name from public.profiles where id = tests.uid('namer')), 'namer',
  'L1a the name is unchanged after the refused updates');

-- L1b: names are trimmed, and 24 characters is the limit.
select tests.authenticate_as('namer');
select is((select api.update_profile(' Sam ')->>'status'), 'ok', 'L1b a name with spaces around it answers ok');
select tests.clear_authentication();
select is((select display_name from public.profiles where id = tests.uid('namer')), 'Sam',
  'L1b the stored name is trimmed');
select tests.authenticate_as('namer');
select is((select api.update_profile(repeat('y', 24))->>'status'), 'ok', 'L1b a name of 24 characters answers ok');

-- L1c: no name yet, no room and no seat.
select tests.clear_authentication();
select tests.create_room(1, 'quick_match', 'FR', 'c');
select tests.create_user('nameless');
select tests.authenticate_as('nameless');
select is((select api.create_room('quick_match', 'FR')->>'status'), 'name_required',
  'L1c create_room without a name answers name_required');
select is((select api.join_room(tests.room_code())->>'status'), 'name_required',
  'L1c join_room without a name answers name_required');
select tests.clear_authentication();
select is((select count(*) from public.room_members where profile_id = tests.uid('nameless')), 0::bigint,
  'L1c the nameless player has no seat');

-- L2: services.
select tests.clear_authentication();
select tests.create_player('shopper');
select tests.authenticate_as('shopper');
select is((select api.set_my_providers('{9001,9002}')->>'status'), 'ok', 'L2 set_my_providers answers ok');
select is((select array_agg(provider_id order by provider_id) from api.my_providers), '{9001,9002}'::integer[],
  'L2 my_providers lists both services');
select is((select api.set_my_providers('{9002}')->>'status'), 'ok', 'L2 setting a shorter list answers ok');
select is((select array_agg(provider_id order by provider_id) from api.my_providers), '{9002}'::integer[],
  'L2 only the service still in the list remains');

-- L3: creating a room.
select tests.clear_authentication();
select tests.create_player('maker');
select tests.authenticate_as('maker');
select api.set_my_providers('{9001}');
select is((select api.create_room('quick_match', 'FR')->>'status'), 'ok', 'L3 create_room answers ok');
select tests.clear_authentication();
select is(
  (select count(*) from public.rooms r where r.host_id = tests.uid('maker') and r.code ~ '^[0-9]{6}$'),
  1::bigint,
  'L3 the room has a 6-digit code'
);
select is(
  (select r.state::text || '/' || r.max_players || '/' || r.provider_ids::text
   from public.rooms r where r.host_id = tests.uid('maker')),
  'lobby/10/{9001}',
  'L3 the room is in the lobby with 10 seats and the host''s services'
);
select is(
  (select m.role::text || '/' || m.provider_ids::text from public.room_members m
   where m.profile_id = tests.uid('maker')),
  'host/{9001}',
  'L3 the creator holds the host seat with their services'
);
select is(
  (select count(*) from public.room_models rm join public.rooms r on r.id = rm.room_id
   where r.host_id = tests.uid('maker')),
  1::bigint,
  'L3 the room has a room model'
);

-- L4: joining.
select tests.create_room(1, 'quick_match', 'FR', 'j');
select tests.create_player('p2');
select tests.authenticate_as('p2');
select is(
  (select (a->>'status') || '/' || (a->>'state') || '/' || (a->>'rejoined')
          || '/' || ((a->>'member_id') is not null)::text
   from (select api.join_room(tests.room_code()) as a) x),
  'ok/lobby/false/true',
  'L4 join_room answers ok with a seat, in the lobby, not rejoined'
);
select tests.clear_authentication();
select is((select role::text from public.room_members where id = tests.member_id('p2')), 'guest',
  'L4 the joiner gets a guest seat');
select is(
  (select p->>'member_id' || '/' || (p->>'display_name') from tests.broadcasts(tests.room_id(), 'member_joined') p),
  tests.member_id('p2') || '/p2',
  'L4 member_joined carries the seat id and the display name'
);
select tests.authenticate_as('p2');
select is(
  (select (a->>'status') || '/' || (a->>'rejoined') || '/' || (a->>'member_id')
   from (select api.join_room(tests.room_code()) as a) x),
  'ok/true/' || tests.member_id('p2'),
  'L4 joining again answers ok with the same seat, rejoined'
);
select tests.clear_authentication();
select is((select count(*) from public.room_members where room_id = tests.room_id()), 2::bigint,
  'L4 the room still has 2 seats');

-- L4b (beyond the 120): a full room.
select tests.create_room(2, 'date_night', 'FR', 'd');
select tests.create_player('d3');
select tests.authenticate_as('d3');
select is((select api.join_room(tests.room_code())->>'status'), 'full', 'L4b a third joiner of a date night gets full');
select tests.clear_authentication();
select is((select count(*) from public.room_members where room_id = tests.room_id()), 2::bigint,
  'L4b the full room gained no seat');

-- L4c (beyond the 120): a room in its finale.
select tests.create_room(2, 'quick_match', 'FR', 'f');
select tests.create_player('f3');
update public.rooms set state = 'finale' where id = tests.room_id();
select tests.authenticate_as('f3');
select is((select api.join_room(tests.room_code())->>'status'), 'in_finale',
  'L4c a new joiner of a room in its finale gets in_finale');
select tests.clear_authentication();
select is((select count(*) from public.room_members where room_id = tests.room_id()), 2::bigint,
  'L4c the room in its finale gained no seat');

-- L5: a wrong code is an answer.
select tests.clear_authentication();
select tests.create_player('lost');
select tests.authenticate_as('lost');
select is((select api.join_room('000000')->>'status'), 'not_found', 'L5 an unknown code answers not_found, no error');

-- L6, L7: settings, host only.
select tests.clear_authentication();
select tests.create_room(2, 'quick_match', 'FR', 's');
select tests.authenticate_as('s1');
select is(
  (select api.update_room_settings(tests.room_id(), '{"seen_rule":"show_all","quality":"hidden_gems"}')->>'status'),
  'ok',
  'L6 the host''s update_room_settings answers ok'
);
select tests.clear_authentication();
select is(
  (select r.seen_rule::text || '/' || r.quality::text from public.rooms r where r.id = tests.room_id()),
  'show_all/hidden_gems',
  'L6 the room has both new values'
);
select is(
  (select p->>'seen_rule' from tests.broadcasts(tests.room_id(), 'settings_changed') p),
  'show_all',
  'L6 settings_changed carries the seen_rule sent'
);
select tests.authenticate_as('s2');
select throws_ok(
  $$select api.update_room_settings(tests.room_id(), '{"seen_rule":"hide_seen","quality":"standard"}')$$,
  '42501', null,
  'L7 a guest''s update_room_settings raises 42501'
);
select tests.clear_authentication();
select is(
  (select r.seen_rule::text || '/' || r.quality::text from public.rooms r where r.id = tests.room_id()),
  'show_all/hidden_gems',
  'L7 the room is unchanged'
);

-- L8: seat preferences make the room's services.
select tests.create_room(2, 'quick_match', 'FR', 'q');
select tests.authenticate_as('q1');
select is((select api.set_seat_prefs(tests.room_id(), '{9001}')->>'status'), 'ok', 'L8 the host''s set_seat_prefs answers ok');
select tests.authenticate_as('q2');
select is((select api.set_seat_prefs(tests.room_id(), '{9002}')->>'status'), 'ok', 'L8 the guest''s set_seat_prefs answers ok');
select tests.clear_authentication();
select is((select provider_ids from public.rooms where id = tests.room_id()), '{9001,9002}'::integer[],
  'L8 the room''s services are the union of the seats''');
select is(
  (select array_agg(p->>'member_id' order by p->>'member_id') from tests.broadcasts(tests.room_id(), 'seat_updated') p),
  (select array_agg(x::text order by x::text) from unnest(array[tests.member_id('q1'), tests.member_id('q2')]) x),
  'L8 one seat_updated goes out per seat'
);

-- L9: only the host starts.
select tests.create_room(2, 'quick_match', 'FR', 'g');
select tests.authenticate_as('g2');
select throws_ok($$select api.start_game(tests.room_id())$$, '42501', null, 'L9 a guest''s start_game raises 42501');
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'lobby', 'L9 the room stays in the lobby');

select * from finish();
rollback;

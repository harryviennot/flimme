-- M4.5: when the host leaves, the role passes to the longest-seated present player, else
-- to the longest-seated seat that hasn't left (game-modes.md#who-counts-presence-joining-and-leaving,
-- data-model.md#leaving-and-coming-back). Each scenario deals its own room with its own prefix.
-- Seats are aged by hand: joined_at and last_active_at.

begin;
select plan(24);

select tests.create_catalog(40);

-- Sets one seat's age: joined this long ago, last heard this long ago.
create function pg_temp.age(p_name text, p_joined interval, p_heard interval) returns void
language sql
as $$
  update public.room_members
  set joined_at = now() - p_joined, last_active_at = now() - p_heard
  where id = tests.member_id(p_name)
$$;

create function pg_temp.role_of(p_name text) returns text
language sql
as $$ select m.role::text from public.room_members m where m.id = tests.member_id(p_name) $$;

-- 1. The Done when: a2 joined before a3 but is absent, a3 is present.
select tests.deal_game(3, 'a', 'lobby');
select pg_temp.age('a1', interval '4 minutes', interval '1 second');
select pg_temp.age('a2', interval '3 minutes', interval '2 minutes');
select pg_temp.age('a3', interval '1 minute', interval '1 second');
select tests.authenticate_as('a1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('a3'), 'host', '1 the present a3 gets the role over the absent, earlier a2');
select is(pg_temp.role_of('a1'), 'guest', '1 the leaver is a guest');
select is(pg_temp.role_of('a2'), 'guest', '1 the absent a2 stays a guest');
select is((select r.host_id from public.rooms r where r.id = tests.room_id()), tests.uid('a3'),
  '1 rooms.host_id is a3''s profile');
select is((select m->>'new_host_member_id' from tests.broadcasts(tests.room_id(), 'member_left') m),
  tests.member_id('a3')::text, '1 member_left carries a3''s seat');

-- 2. 89 seconds is present, 91 is not.
select tests.deal_game(3, 'b', 'lobby');
select pg_temp.age('b1', interval '4 minutes', interval '1 second');
select pg_temp.age('b2', interval '3 minutes', interval '89 seconds');
select pg_temp.age('b3', interval '1 minute', interval '1 second');
select tests.authenticate_as('b1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('b2'), 'host', '2 a seat heard 89 seconds ago is present and gets the role');

select tests.deal_game(3, 'c', 'lobby');
select pg_temp.age('c1', interval '4 minutes', interval '1 second');
select pg_temp.age('c2', interval '3 minutes', interval '91 seconds');
select pg_temp.age('c3', interval '1 minute', interval '1 second');
select tests.authenticate_as('c1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('c3'), 'host', '2 a seat heard 91 seconds ago is absent, so c3 gets the role');

-- 3. Every other seat absent: the longest-seated of them (Q5.1).
select tests.deal_game(3, 'd', 'lobby');
select pg_temp.age('d1', interval '4 minutes', interval '1 second');
select pg_temp.age('d2', interval '3 minutes', interval '5 minutes');
select pg_temp.age('d3', interval '1 minute', interval '5 minutes');
select tests.authenticate_as('d1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('d2'), 'host', '3 with everyone else absent, the longest-seated gets the role');

-- 4. A seat that left is never picked, even present and earlier.
select tests.deal_game(3, 'e', 'lobby');
select pg_temp.age('e1', interval '4 minutes', interval '1 second');
select pg_temp.age('e2', interval '3 minutes', interval '1 second');
select pg_temp.age('e3', interval '1 minute', interval '1 second');
update public.room_members set left_at = now() where id = tests.member_id('e2');
select tests.authenticate_as('e1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('e3'), 'host', '4 a seat that left is never picked');

-- 5. A removed seat is never picked.
select tests.deal_game(3, 'f', 'lobby');
select pg_temp.age('f1', interval '4 minutes', interval '1 second');
select pg_temp.age('f2', interval '3 minutes', interval '1 second');
select pg_temp.age('f3', interval '1 minute', interval '1 second');
update public.room_members set removed_at = now() where id = tests.member_id('f2');
select tests.authenticate_as('f1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('f3'), 'host', '5 a removed seat is never picked');

-- 6. Same joined_at: the lower seat id wins.
select tests.deal_game(3, 'g', 'lobby');
select pg_temp.age('g1', interval '4 minutes', interval '1 second');
update public.room_members set joined_at = now() - interval '2 minutes', last_active_at = now()
where id in (tests.member_id('g2'), tests.member_id('g3'));
select tests.authenticate_as('g1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(
  (select m.id from public.room_members m where m.room_id = tests.room_id() and m.role = 'host'),
  (select least(tests.member_id('g2'), tests.member_id('g3'))),
  '6 two present seats with the same joined_at: the lower seat id gets the role');

-- 7. The host alone (Q5.2).
select tests.create_room(1, 'quick_match', 'FR', 'h');
create temp table h_room as select tests.room_id() as id,
  (select host_id from public.rooms where id = tests.room_id()) as host_id;
select tests.authenticate_as('h1');
create temp table h_leave as select api.leave_room(tests.room_id()) as a;
select tests.clear_authentication();
select is((select a->>'status' from h_leave), 'ok', '7 the lone host''s leave answers ok');
select is((select count(*) from public.room_members m where m.room_id = tests.room_id() and m.role = 'host'),
  0::bigint, '7 nobody holds the host role');
select is((select m->>'new_host_member_id' from tests.broadcasts(tests.room_id(), 'member_left') m), null,
  '7 new_host_member_id is null');
select is((select r.host_id from public.rooms r where r.id = tests.room_id()), (select host_id from h_room),
  '7 rooms.host_id is unchanged');

-- 8. A guest leaving changes nothing about the host.
select tests.deal_game(3, 'i', 'lobby');
select tests.authenticate_as('i2');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('i1'), 'host', '8 the host stays the host when a guest leaves');
select is((select m->>'new_host_member_id' from tests.broadcasts(tests.room_id(), 'member_left') m), null,
  '8 new_host_member_id is null when a guest leaves');

-- 9. In swiping the same pick applies and the match re-check still runs.
select tests.deal_game(3, 'j', 'swiping');
select tests.vote('j2', 1);
select tests.vote('j3', 1);
-- Voting counts as being heard, so age the seats after the votes.
select pg_temp.age('j1', interval '4 minutes', interval '1 second');
select pg_temp.age('j2', interval '3 minutes', interval '1 second');
select pg_temp.age('j3', interval '1 minute', interval '1 second');
select tests.authenticate_as('j1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.role_of('j2'), 'host', '9 in swiping the longest-seated present j2 gets the role');
select is(
  (select count(*) from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(1)),
  1::bigint, '9 the match the leaver was blocking is recorded');

-- 11. The old host rejoining comes back as a guest on the same seat.
select tests.deal_game(3, 'k', 'lobby');
create temp table k_seat as select tests.member_id('k1') as id;
select tests.authenticate_as('k1');
select api.leave_room(tests.room_id());
create temp table k_join as select api.join_room(tests.room_code()) as a;
select tests.clear_authentication();
select is((select a->>'member_id' from k_join), (select id::text from k_seat), '11 the old host rejoins on the same seat');
select is(pg_temp.role_of('k1'), 'guest', '11 and is a guest');

-- 10. After every leave above, no room has two hosts.
select is(
  (select count(*) from (select room_id from public.room_members where role = 'host'
                         group by room_id having count(*) > 1) x),
  0::bigint, '10 no room has more than one host');

-- 12. The helper has no grant.
select is(has_function_privilege('authenticated', 'internal.next_host_member(uuid)', 'execute'), false,
  '12 authenticated cannot execute internal.next_host_member');
select is(has_function_privilege('anon', 'internal.next_host_member(uuid)', 'execute'), false,
  '12 anon cannot execute internal.next_host_member');

select * from finish();
rollback;

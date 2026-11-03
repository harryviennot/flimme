-- M4.1: invite links carry a room reference (rooms.id). join_room(code, ref) answers
-- closed when the code now belongs to another room, and stores how the seat came in.
-- (security.md#room-codes-joining-and-the-host layer 3, analytics.md#changes-this-asks-elsewhere)

begin;
select plan(29);

-- One attempt as a named player, back to the superuser afterwards. The answer is the status.
create function pg_temp.try_join(p_name text, p_code text, p_ref uuid default null,
                                 p_via text default null, p_at timestamptz default null)
returns text language plpgsql as $$
declare v_status text;
begin
  perform tests.authenticate_as(p_name);
  v_status := api.join_room(p_code, p_ref, p_via, p_at)->>'status';
  perform tests.clear_authentication();
  return v_status;
end
$$;

create function pg_temp.join_quiet(p_name text, p_code text, p_ref uuid default null,
                                   p_via text default null, p_at timestamptz default null)
returns void language sql as $$ select pg_temp.try_join(p_name, p_code, p_ref, p_via, p_at) $$;
-- (a bare select of try_join would print its answer, which TAP readers mistake for a test)

-- Room A (p1, p2) is done; room B (q1, q2) reuses A's code. Room C (c1) is open with its own code.
create temp table fx as
select (a->>'room_id')::uuid as a_id, a->>'code' as code from (select tests.create_room(2, 'quick_match', 'FR', 'p') as a) s;
update public.rooms set state = 'done' where id = (select a_id from fx);
select tests.create_room(2, 'quick_match', 'FR', 'q');
create temp table fx2 as select tests.room_id() as b_id;
update public.rooms set code = (select code from fx) where id = (select b_id from fx2);
select tests.create_room(1, 'quick_match', 'FR', 'c');
create temp table fx3 as select tests.room_id() as c_id, tests.room_code() as c_code;
grant select on fx, fx2, fx3 to public;
-- The room was made an hour ago, so a link opened since is in the past.
update public.rooms set created_at = now() - interval '1 hour' where id = (select c_id from fx3);
select tests.create_player('g1');
select tests.create_player('g2');
select tests.create_player('g3');
select tests.create_player('g4');

-- 1. A link to a closed room can't join the newer room that reused its code.
select is(pg_temp.try_join('g1', (select code from fx), (select a_id from fx)), 'closed',
  '1 join_room(X, A.id) answers closed when B reuses X');
select is((select count(*) from public.room_members where profile_id = tests.uid('g1')), 0::bigint,
  '1 and B gains no seat');

-- 2. An old seat in A doesn't change the answer.
select is(pg_temp.try_join('p1', (select code from fx), (select a_id from fx)), 'closed',
  '2 a player with a seat in A still gets closed, not their old seat');

-- 3. B's own id joins, and a second call is a rejoin.
select is(pg_temp.try_join('g2', (select code from fx), (select b_id from fx2)), 'ok',
  '3 join_room(X, B.id) answers ok');
select is((select api.join_room((select code from fx), (select b_id from fx2))->>'rejoined'
           from (select tests.authenticate_as('g2')) s), 'true',
  '3 and a second call answers ok with rejoined true');
select tests.clear_authentication();

-- 4. A ref naming a done room whose code no open room uses answers closed, not not_found.
update public.rooms set state = 'done' where id = (select b_id from fx2);
select is(pg_temp.try_join('g3', (select code from fx), (select a_id from fx)), 'closed',
  '4 a done room''s ref with a code no open room uses answers closed');
-- 5. A random ref with an unused code.
select is(pg_temp.try_join('g3', '000000', gen_random_uuid()), 'closed',
  '5 a random uuid ref with an unused code answers closed');
-- 6. Open room B's id with open room C's code answers closed.
update public.rooms set state = 'lobby' where id = (select b_id from fx2);
update public.rooms set code = '777777' where id = (select b_id from fx2);
select is(pg_temp.try_join('g3', (select c_code from fx3), (select b_id from fx2)), 'closed',
  '6 open room B''s id with open room C''s code answers closed');
-- 7. Without a ref: behaviour kept.
select is(pg_temp.try_join('g4', '000001'), 'not_found', '7 no ref, an unused code answers not_found');
select is(pg_temp.try_join('g4', (select c_code from fx3)), 'ok', '7 no ref, an open room''s code answers ok');

-- 8. Five closed answers, then rate_limited.
select tests.create_player('r1');
select is(
  (select count(*) filter (where pg_temp.try_join('r1', (select c_code from fx3), gen_random_uuid()) = 'closed')
   from generate_series(1, 5)),
  5::bigint, '8 five closed answers');
select is(pg_temp.try_join('r1', (select c_code from fx3), (select c_id from fx3)), 'rate_limited',
  '8 the sixth call answers rate_limited');

-- 9 to 15: what the seat stores.
select tests.create_player('v1'); select tests.create_player('v2'); select tests.create_player('v3');
select tests.create_player('v4'); select tests.create_player('v5'); select tests.create_player('v6');
select pg_temp.join_quiet('v1', (select c_code from fx3), null, 'code');
select is((select joined_via::text from public.room_members where profile_id = tests.uid('v1')), 'code',
  '9 via code stores joined_via code');
select is((select link_opened_at from public.room_members where profile_id = tests.uid('v1')), null,
  '9 and a null link_opened_at');

select pg_temp.join_quiet('v2', (select c_code from fx3), (select c_id from fx3), 'link',
  (select created_at + interval '10 minutes' from public.rooms where id = (select c_id from fx3)));
select is((select link_opened_at from public.room_members where profile_id = tests.uid('v2')),
  (select created_at + interval '10 minutes' from public.rooms where id = (select c_id from fx3)),
  '10 via link stores a time between the room''s creation and now');

select pg_temp.join_quiet('v3', (select c_code from fx3), null, 'link', now() + interval '1 day');
select is((select link_opened_at from public.room_members where profile_id = tests.uid('v3')), now(),
  '11 a future link_opened_at is stored as now');
select pg_temp.join_quiet('v4', (select c_code from fx3), null, 'link', timestamptz '2000-01-01');
select is((select link_opened_at from public.room_members where profile_id = tests.uid('v4')),
  (select created_at from public.rooms where id = (select c_id from fx3)),
  '11 one before the room''s created_at is stored as created_at');

select pg_temp.join_quiet('v5', (select c_code from fx3), null, 'code', now());
select is((select link_opened_at from public.room_members where profile_id = tests.uid('v5')), null,
  '12 link_opened_at with via code stores null');

select tests.authenticate_as('v6');
select throws_ok($$select api.join_room((select c_code from fx3), null, 'carrier_pigeon', null)$$, '22023', null,
  '13 an unknown via raises 22023');
select tests.clear_authentication();
select is((select count(*) from public.room_members where profile_id = tests.uid('v6')), 0::bigint,
  '13 and no seat is made');

select tests.create_player('n1');
select pg_temp.join_quiet('n1', (select c_code from fx3));
select is((select joined_via::text from public.room_members where profile_id = tests.uid('n1')), null,
  '14 no via stores null');

-- 15. A rejoin keeps the first via and link_opened_at.
select pg_temp.join_quiet('v2', (select c_code from fx3), null, 'rejoin', now());
select is((select joined_via::text from public.room_members where profile_id = tests.uid('v2')), 'link',
  '15 a rejoin keeps joined_via link');
select is((select link_opened_at from public.room_members where profile_id = tests.uid('v2')),
  (select created_at + interval '10 minutes' from public.rooms where id = (select c_id from fx3)),
  '15 and link_opened_at unchanged');

-- 16. Full carries max_players.
update public.rooms set max_players = 2 where id = (select c_id from fx3);
select tests.create_player('f1');
select tests.authenticate_as('f1');
select is((select api.join_room((select c_code from fx3))), jsonb_build_object('status', 'full', 'max_players', 2),
  '16 a full room answers full with the room''s max_players');
select tests.clear_authentication();

-- 17. name_required carries the host's name.
select tests.create_user('nameless');
select tests.authenticate_as('nameless');
select is((select api.join_room((select c_code from fx3))->>'host_name'), 'c1',
  '17 a nameless player gets name_required with the host seat''s name');
select tests.clear_authentication();

-- 18. Phones never read the analytics columns.
select is((select count(*) from information_schema.columns
           where table_schema = 'api' and table_name = 'room_seats'
             and column_name in ('joined_via', 'link_opened_at')), 0::bigint,
  '18 api.room_seats has no joined_via or link_opened_at column');

-- 19. One function, granted to authenticated only.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'api' and p.proname = 'join_room'), 1::bigint, '19 exactly one api.join_room exists');
select ok(has_function_privilege('authenticated', 'api.join_room(text, uuid, text, timestamptz)', 'execute'),
  '19 authenticated can execute it');
select ok(not has_function_privilege('anon', 'api.join_room(text, uuid, text, timestamptz)', 'execute'),
  '19 anon cannot');

select * from finish();
rollback;

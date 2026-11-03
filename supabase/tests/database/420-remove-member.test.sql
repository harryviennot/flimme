-- M4.2: the host removes a player. api.remove_member sets removed_at and left_at, tells the
-- room, recomputes tonight's services and re-checks the liked cards; the removed player
-- can't come back (join_room and room_preview answer removed).
-- (security.md#room-codes-joining-and-the-host, data-model.md#leaving-and-coming-back)

begin;
select plan(40);

select tests.create_catalog(40);

-- As this player: remove_member's status, or its error code when it raises.
create function pg_temp.remove(p_name text, p_room uuid, p_member uuid) returns text
language plpgsql as $$
declare v_status text;
begin
  perform tests.authenticate_as(p_name);
  begin
    v_status := api.remove_member(p_room, p_member)->>'status';
  exception when others then
    v_status := 'error ' || sqlstate;
  end;
  perform tests.clear_authentication();
  return v_status;
end
$$;

create function pg_temp.join(p_name text, p_code text, p_ref uuid default null) returns text
language plpgsql as $$
declare v_status text;
begin
  perform tests.authenticate_as(p_name);
  v_status := api.join_room(p_code, p_ref)->>'status';
  perform tests.clear_authentication();
  return v_status;
end
$$;

-- Room A: a1 (host), a2, a3, in the lobby.
select tests.deal_game(3, 'a', 'lobby');
create temp table fa as select tests.room_id() as id, tests.room_code() as code;
grant select on fa to public;
select tests.connect_letterboxd('a2', 'test_viewer', false);
create temp table before_join as
select (select count(*) from tests.broadcasts((select id from fa), 'member_joined')) as joined,
       (select la.sync_requested_at from public.linked_accounts la where la.id = tests.linked_account_id('a2')) as sync_at;
grant select on before_join to public;

-- 1. The host removes a guest.
select is(pg_temp.remove('a1', (select id from fa), tests.member_id('a2')), 'ok', '1 the host removes a guest');
select is(
  (select (m.removed_at is not null) || '/' || (m.left_at is not null) from public.room_members m where m.id = tests.member_id('a2')),
  'true/true', '1 the seat has removed_at and left_at set');
select is(
  (select count(*) from tests.broadcasts((select id from fa), 'member_removed') b where b->>'member_id' = tests.member_id('a2')::text),
  1::bigint, '1 member_removed carries the seat id');
select is(
  (select count(*) from tests.broadcasts((select id from fa), 'member_removed') b, jsonb_object_keys(b) k where k not in ('member_id', 'id')),
  0::bigint, '1 member_removed carries nothing but the seat id');

-- 2. The removed player reads nothing of the room.
select tests.authenticate_as('a2');
select is(internal.is_room_member((select id from fa)), false, '2 the removed player is no member');
select is((select count(*) from api.rooms where id = (select id from fa)), 0::bigint, '2 api.rooms returns nothing to them');
select is((select count(*) from api.room_seats where room_id = (select id from fa)), 0::bigint, '2 api.room_seats returns nothing to them');
select tests.clear_authentication();

-- 3. Only the seated host.
select is(pg_temp.remove('a3', (select id from fa), tests.member_id('a1')), 'error 42501', '3 a guest cannot remove');
select tests.deal_game(3, 'h', 'lobby');
create temp table fh as select tests.room_id() as id;
grant select on fh to public;
update public.room_members set left_at = now() where id = tests.member_id('h1');
select is(pg_temp.remove('h1', (select id from fh), tests.member_id('h2')), 'error 42501', '3 a host who has left cannot remove');

-- 4. Arguments.
select is(pg_temp.remove('a1', (select id from fa), tests.member_id('a1')), 'error 22023', '4 the host cannot remove their own seat');
select is(pg_temp.remove('a1', (select id from fa), null), 'error 22023', '4 a null member id raises 22023');
select is(pg_temp.remove('a1', null, tests.member_id('a3')), 'error 22023', '4 a null room id raises 22023');

-- 5. A seat of another room.
select is(pg_temp.remove('a1', (select id from fa), tests.member_id('h2', (select id from fh))), 'not_in_room', '5 a seat of another room is not_in_room');

-- 6. Removing again is ok and silent.
select is(pg_temp.remove('a1', (select id from fa), tests.member_id('a2')), 'ok', '6 removing a removed seat answers ok');
select is((select count(*) from tests.broadcasts((select id from fa), 'member_removed')), 1::bigint, '6 no second broadcast');

-- 7. A seat that already left keeps its left_at.
update public.room_members set left_at = now() - interval '1 hour' where id = tests.member_id('a3');
create temp table left_before as select left_at from public.room_members where id = tests.member_id('a3');
grant select on left_before to public;
select is(pg_temp.remove('a1', (select id from fa), tests.member_id('a3')), 'ok', '7 removing a seat that left answers ok');
select is(
  (select (m.removed_at is not null) || '/' || (m.left_at = (select left_at from left_before)) from public.room_members m where m.id = tests.member_id('a3')),
  'true/true', '7 removed_at is set and left_at is unchanged');

-- 8. A finished room.
select tests.deal_game(3, 'd', 'lobby');
update public.rooms set state = 'done' where id = tests.room_id();
select is(pg_temp.remove('d1', tests.room_id(), tests.member_id('d2')), 'closed', '8 a done room answers closed');

-- 9. The removed player cannot come back.
select is(pg_temp.join('a2', (select code from fa)), 'removed', '9 join_room by code answers removed');
select is(pg_temp.join('a2', (select code from fa), (select id from fa)), 'removed', '9 join_room by link answers removed');
select is((select left_at is not null from public.room_members where id = tests.member_id('a2')), true, '9 left_at stays set');
select is((select count(*) from tests.broadcasts((select id from fa), 'member_joined')), (select joined from before_join), '9 no member_joined broadcast');
select is(
  (select la.sync_requested_at is not distinct from (select sync_at from before_join) from public.linked_accounts la where la.id = tests.linked_account_id('a2')),
  true, '9 no Letterboxd sync was requested');

-- 10. A removed answer is not a failed attempt.
select tests.deal_game(3, 'x', 'lobby');
create temp table fx as select tests.room_id() as id, tests.room_code() as code;
grant select on fx to public;
select pg_temp.remove('x1', (select id from fx), tests.member_id('x2'));
select pg_temp.join('x2', (select code from fx)) from generate_series(1, 5);
select is(pg_temp.join('x2', (select code from fx)), 'removed', '10 the sixth attempt still answers removed');
select pg_temp.join('x2', (select code from fx)) from generate_series(1, 4);
select is(pg_temp.join('x2', (select code from fx)), 'rate_limited', '10 the eleventh is rate_limited by the per-profile limit');

-- 11. The preview.
select tests.authenticate_as('a2');
create temp table prev as select api.room_preview((select code from fa), (select id from fa)) as a;
select tests.clear_authentication();
grant select on prev to public;
select is((select a->>'status' from prev), 'removed', '11 room_preview answers removed');
select is((select a ? 'host_name' from prev), false, '11 and names no host');

-- 12. Tonight's services are recomputed.
select tests.deal_game(3, 'n', 'lobby');
select tests.create_provider(9301, 'Netflix Test');
select tests.create_provider(9302, 'Other Test');
update public.room_members set provider_ids = '{9301,9302}' where id = tests.member_id('n2');
update public.room_members set provider_ids = '{9302}' where id = tests.member_id('n3');
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()), '{9301,9302}'::integer[], '12 control: both services before');
select pg_temp.remove('n1', tests.room_id(), tests.member_id('n2'));
select is((select provider_ids from public.rooms where id = tests.room_id()), '{9302}'::integer[], '12 the removed seat''s only service is gone');

-- 13. Removing the one who hadn't liked makes the match.
select tests.deal_game(3, 'r');
select tests.vote('r1', 1);
select tests.vote('r2', 1);
select is((select count(*) from public.matches where room_id = tests.room_id()), 0::bigint, '13 control: no match with two likes of three');
select is(pg_temp.remove('r1', tests.room_id(), tests.member_id('r3')), 'ok', '13 the host removes the third');
select is((select count(*) from public.matches where room_id = tests.room_id()), 1::bigint, '13 a match is created');
select is((select count(*) from tests.broadcasts(tests.room_id(), 'match')), 1::bigint, '13 and broadcast');

-- 14. A removed seat's vote no longer counts and it cannot vote.
select tests.deal_game(3, 's');
select tests.vote('s1', 2);
select tests.vote('s2', 2);
select pg_temp.remove('s1', tests.room_id(), tests.member_id('s2'));
select is((select count(*) from public.matches where room_id = tests.room_id()), 0::bigint, '14 no match: one of the two present has liked');
select tests.authenticate_as('s2');
select throws_ok($$select api.cast_vote(tests.room_id(), tests.film(3), 'like')$$, '42501', null, '14 a removed seat cannot vote');
select is((select count(*) from api.my_votes where room_id = tests.room_id()), 1::bigint, '14 but still reads its own votes');
select tests.clear_authentication();
select tests.vote('s3', 2);
select is(
  (select mt.like_count || '/' || mt.present_count from public.matches mt where mt.room_id = tests.room_id()),
  '2/2', '14 the match counts the two present likes only');

-- 16. Privileges.
select ok(has_function_privilege('authenticated', 'api.remove_member(uuid, uuid)', 'execute'), '16 authenticated can call remove_member');
select ok(not has_function_privilege('anon', 'api.remove_member(uuid, uuid)', 'execute'), '16 anon cannot');
select ok(not has_function_privilege('authenticated', 'internal.recheck_room_matches(uuid)', 'execute')
      and not has_function_privilege('anon', 'internal.recheck_room_matches(uuid)', 'execute'),
  '16 neither can call internal.recheck_room_matches');

select * from finish();
rollback;

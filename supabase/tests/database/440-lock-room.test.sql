-- M4.23: the host locks the room so nobody new takes a seat; players who already have a seat can
-- still come back. A player who rejoins a room with no host seat takes the host role (Q23.3).
-- (security.md#room-codes-joining-and-the-host, data-model.md#leaving-and-coming-back)

begin;
select plan(42);

select tests.create_catalog(40);

-- set_room_locked's answer, or {status: 'error <sqlstate>'} when it raises.
create function pg_temp.lock(p_name text, p_room uuid, p_locked boolean) returns jsonb
language plpgsql as $$
declare v_answer jsonb;
begin
  perform tests.authenticate_as(p_name);
  begin
    v_answer := api.set_room_locked(p_room, p_locked);
  exception when others then
    v_answer := jsonb_build_object('status', 'error ' || sqlstate);
  end;
  perform tests.clear_authentication();
  return v_answer;
end
$$;

create function pg_temp.join(p_name text, p_code text, p_ref uuid default null, p_via text default null) returns jsonb
language plpgsql as $$
declare v_answer jsonb;
begin
  perform tests.authenticate_as(p_name);
  v_answer := api.join_room(p_code, p_ref, p_via);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

create function pg_temp.preview(p_name text, p_code text, p_ref uuid) returns jsonb
language plpgsql as $$
declare v_answer jsonb;
begin
  perform tests.authenticate_as(p_name);
  v_answer := api.room_preview(p_code, p_ref);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

create function pg_temp.leave(p_name text, p_room uuid) returns void
language plpgsql as $$
begin
  perform tests.authenticate_as(p_name);
  perform api.leave_room(p_room);
  perform tests.clear_authentication();
end
$$;

create function pg_temp.role_of(p_name text, p_room uuid) returns text
language sql as $$ select m.role::text from public.room_members m where m.id = tests.member_id(p_name, p_room) $$;

create function pg_temp.has_seat(p_name text, p_room uuid) returns boolean
language sql as $$ select exists (select 1 from public.room_members m where m.room_id = p_room and m.profile_id = tests.uid(p_name)) $$;

-- Players with no seat anywhere.
select tests.create_player('g1');
select tests.create_player('g2');
select tests.create_player('g3');
select tests.create_player('g4');
select tests.create_player('g5');
select tests.create_player('g6');
select tests.create_user('g7');            -- no display name
select set_config('request.headers', '', true);

-- Room A (a1 host, a2, a3) in the lobby.
select tests.create_room(3, 'quick_match', 'FR', 'a');
create temp table fa as select tests.room_id() as id, tests.room_code() as code;
grant select on fa to public;

-- 1. The host locks a lobby.
select is(pg_temp.lock('a1', (select id from fa), true), jsonb_build_object('status', 'ok', 'locked', true),
  '1 the host locks the room: ok, locked true');
select is((select r.locked from public.rooms r where r.id = (select id from fa)), true, '1 rooms.locked is true');
select is((select r.locked from api.rooms r where r.id = (select id from fa)), true, '1 api.rooms shows locked');
select is((select count(*) from tests.broadcasts((select id from fa), 'room_locked') b where b->>'locked' = 'true'), 1::bigint,
  '1 room_locked {locked: true} was broadcast');

-- 2. Locking again: ok, no second broadcast.
select is(pg_temp.lock('a1', (select id from fa), true), jsonb_build_object('status', 'ok', 'locked', true),
  '2 locking a locked room answers ok');
select is((select count(*) from tests.broadcasts((select id from fa), 'room_locked')), 1::bigint,
  '2 and broadcasts nothing');

-- 6. A new player by code, and by link: locked, no seat, no member_joined.
create temp table before_join as select (select count(*) from tests.broadcasts((select id from fa), 'member_joined')) as joined;
grant select on before_join to public;
select is(pg_temp.join('g1', (select code from fa)), jsonb_build_object('status', 'locked'), '6 by code: locked');
select is(pg_temp.join('g1', (select code from fa), (select id from fa), 'link'), jsonb_build_object('status', 'locked'),
  '6 by link: locked');
select ok(not pg_temp.has_seat('g1', (select id from fa)), '6 no seat was made');
select is((select count(*) from tests.broadcasts((select id from fa), 'member_joined')), (select joined from before_join),
  '6 no member_joined was sent');

-- 7. Not a failed attempt: the sixth still answers locked.
select pg_temp.join('g2', (select code from fa));
select pg_temp.join('g2', (select code from fa));
select pg_temp.join('g2', (select code from fa));
select pg_temp.join('g2', (select code from fa));
select pg_temp.join('g2', (select code from fa));
select is(pg_temp.join('g2', (select code from fa))->>'status', 'locked', '7 the sixth join still answers locked');

-- 8. locked wins over full, in_finale and name_required.
select tests.create_room(2, 'quick_match', 'FR', 'b');
create temp table fb as select tests.room_id() as id, tests.room_code() as code;
grant select on fb to public;
update public.rooms set max_players = 2 where id = (select id from fb);
select pg_temp.lock('b1', (select id from fb), true);
select is(pg_temp.join('g3', (select code from fb))->>'status', 'locked', '8 a locked full room answers locked, not full');

select tests.create_room(2, 'quick_match', 'FR', 'c');
create temp table fc as select tests.room_id() as id, tests.room_code() as code;
grant select on fc to public;
select pg_temp.lock('c1', (select id from fc), true);
update public.rooms set state = 'finale' where id = (select id from fc);
select is(pg_temp.join('g4', (select code from fc))->>'status', 'locked', '8 a locked finale room answers locked, not in_finale');

select is(pg_temp.join('g7', (select code from fa))->>'status', 'locked', '8 a nameless newcomer gets locked, not name_required');

-- 9 and 10. A swiping room: a seat that left rejoins, a removed seat stays removed.
select tests.deal_game(3, 'd', 'swiping');
create temp table fd as select tests.room_id() as id, tests.room_code() as code;
grant select on fd to public;
select pg_temp.lock('d1', (select id from fd), true);
select pg_temp.leave('d2', (select id from fd));
select is(pg_temp.join('d2', (select code from fd)),
  jsonb_build_object('status', 'ok', 'room_id', (select id from fd), 'member_id', tests.member_id('d2', (select id from fd)),
                     'state', 'swiping', 'rejoined', true),
  '9 a seat that left rejoins a locked swiping room');
select tests.authenticate_as('d1');
select api.remove_member((select id from fd), tests.member_id('d3', (select id from fd)));
select tests.clear_authentication();
select is(pg_temp.join('d3', (select code from fd))->>'status', 'removed', '10 a removed seat gets removed, not locked');

-- 11. Preview.
select is(pg_temp.preview('g1', (select code from fa), (select id from fa)), jsonb_build_object('status', 'locked'),
  '11 an unseated player previewing a locked room gets locked, no host name');
select is(pg_temp.preview('a2', (select code from fa), (select id from fa)) - 'host_avatar_key' - 'host_name' - 'max_players',
  jsonb_build_object('status', 'ok', 'state', 'lobby', 'players', 3, 'seated', true),
  '11 a seated player previewing it gets ok, seated true');

-- 3. Unlocking (room K): broadcast, and a newcomer can join.
select tests.create_room(2, 'quick_match', 'FR', 'k');
create temp table fk as select tests.room_id() as id, tests.room_code() as code;
grant select on fk to public;
select pg_temp.lock('k1', (select id from fk), true);
select is(pg_temp.lock('k1', (select id from fk), false), jsonb_build_object('status', 'ok', 'locked', false),
  '3 the host unlocks: ok, locked false');
select is((select count(*) from tests.broadcasts((select id from fk), 'room_locked') b where b->>'locked' = 'false'), 1::bigint,
  '3 room_locked {locked: false} was broadcast');
select is((select r.locked from api.rooms r where r.id = (select id from fk)), false, '3 api.rooms shows unlocked');
select is(pg_temp.join('g5', (select code from fk))->>'status', 'ok', '3 a new player can then join');
select is(pg_temp.preview('g6', (select code from fk), (select id from fk))->>'status', 'ok', '3 and preview answers ok again');

-- 4. Not the host: a guest, a host who left, a stranger, a null argument.
select is(pg_temp.lock('a2', (select id from fa), false)->>'status', 'error 42501', '4 a guest cannot lock or unlock');
select tests.create_room(2, 'quick_match', 'FR', 'i');
create temp table fi as select tests.room_id() as id;
grant select on fi to public;
select pg_temp.leave('i1', (select id from fi));
select is(pg_temp.lock('i1', (select id from fi), true)->>'status', 'error 42501', '4 a host who left cannot lock');
select is(pg_temp.lock('g1', (select id from fa), true)->>'status', 'error 42501', '4 a stranger cannot lock');
select is(pg_temp.lock('a1', (select id from fa), null)->>'status', 'error 22023', '4 a null lock value raises 22023');
select is(pg_temp.lock('a1', null, true)->>'status', 'error 22023', '4 a null room raises 22023');

-- 5. A done room.
select tests.create_room(2, 'quick_match', 'FR', 'j');
create temp table fj as select tests.room_id() as id;
grant select on fj to public;
update public.rooms set state = 'done' where id = (select id from fj);
select is(pg_temp.lock('j1', (select id from fj), true), jsonb_build_object('status', 'closed'), '5 a done room answers closed');

-- 12. The host leaves a locked lobby: the guest takes over, the room stays locked, the new host unlocks.
select tests.create_room(2, 'quick_match', 'FR', 'e');
create temp table fe as select tests.room_id() as id;
grant select on fe to public;
select pg_temp.lock('e1', (select id from fe), true);
select pg_temp.leave('e1', (select id from fe));
select is(pg_temp.role_of('e2', (select id from fe)), 'host', '12 the guest becomes host');
select is((select locked from public.rooms where id = (select id from fe)), true, '12 the room stays locked');
select is(pg_temp.lock('e2', (select id from fe), false), jsonb_build_object('status', 'ok', 'locked', false), '12 the new host can unlock');

-- 13. Rejoining a room with no host seat takes the role.
select tests.create_room(1, 'quick_match', 'FR', 'f');
create temp table ff as select tests.room_id() as id, tests.room_code() as code;
grant select on ff to public;
select pg_temp.leave('f1', (select id from ff));
select is(pg_temp.role_of('f1', (select id from ff)), 'guest', '13 the lone host who left holds no role');
select pg_temp.join('f1', (select code from ff));
select is(pg_temp.role_of('f1', (select id from ff)), 'host', '13 rejoining, f1 takes the host role');
select is((select host_id from public.rooms where id = (select id from ff)), tests.uid('f1'), '13 rooms.host_id is f1''s profile');

select tests.create_room(2, 'quick_match', 'FR', 'h');
create temp table fh as select tests.room_id() as id, tests.room_code() as code;
grant select on fh to public;
select pg_temp.leave('h1', (select id from fh));
select pg_temp.leave('h2', (select id from fh));
select pg_temp.join('h2', (select code from fh));
select is(pg_temp.role_of('h2', (select id from fh)), 'host', '13 a guest who left rejoins a room with no host and becomes host');
select is((select host_id from public.rooms where id = (select id from fh)), tests.uid('h2'), '13 rooms.host_id follows');
select is(pg_temp.role_of('h1', (select id from fh)), 'guest', '13 the other seat stays a guest');

-- 14. With a seated host, a rejoining guest stays a guest.
select pg_temp.leave('a3', (select id from fa));
select pg_temp.join('a3', (select code from fa));
select is(pg_temp.role_of('a3', (select id from fa)), 'guest', '14 a guest rejoining a room with a host stays a guest');
select is(pg_temp.role_of('a1', (select id from fa)), 'host', '14 and the host keeps the role');

-- 15. Grants.
select ok(has_function_privilege('authenticated', 'api.set_room_locked(uuid, boolean)', 'execute'), '15 authenticated can call set_room_locked');
select ok(not has_function_privilege('anon', 'api.set_room_locked(uuid, boolean)', 'execute'), '15 anon cannot');

select * from finish();
rollback;

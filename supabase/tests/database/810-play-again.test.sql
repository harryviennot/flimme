-- M6.22: api.play_again (game-modes.md#apiplay_againroom). The host of a finished room opens the
-- next one with the same settings; the other phones learn its code from next_room on the old
-- room's topic, or from api.rooms (next_room_id, next_room_code) when they missed it. Decided
-- 5 Nov 2026 (Q22.1 to Q22.7): a repeat call returns the open next room, an ended one is replaced,
-- the host's seat moods are copied, and the event names the host by seat id, never by name.

begin;
select plan(59);

select tests.create_provider(9001, 'Play Again Service');
select tests.create_player('x1');   -- a stranger, seated nowhere

create temp table fx (k text primary key, id uuid not null, code text not null);
grant all on fx to public;

-- A room with p_n players named <prefix>1.., remembered under p_prefix.
create function pg_temp.mk(p_prefix text, p_n integer) returns void
language plpgsql as $$
begin
  perform tests.create_room(p_n, 'quick_match', 'FR', p_prefix);
  insert into fx values (p_prefix, tests.room_id(), tests.room_code());
end $$;

create function pg_temp.rid(p_k text) returns uuid language sql as $$ select id from fx where k = p_k $$;

-- play_again's answer, or {status: 'error <sqlstate>'} when it raises.
create function pg_temp.again(p_name text, p_room uuid) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  begin
    v := api.play_again(p_room);
  exception when others then
    v := jsonb_build_object('status', 'error ' || sqlstate);
  end;
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.broadcasts(p_room uuid) returns bigint
language sql as $$ select count(*) from realtime.messages m where m.topic = 'room:' || p_room::text and m.event = 'next_room' $$;

create function pg_temp.all_messages(p_room uuid) returns bigint
language sql as $$ select count(*) from realtime.messages m where m.topic like 'room:' || p_room::text || '%' $$;

create function pg_temp.rooms_hosted(p_name text) returns bigint
language sql as $$ select count(*) from public.rooms r where r.host_id = tests.uid(p_name) $$;

-- What api.rooms shows this player for the room: {rows, next_room_id, next_room_code}.
create function pg_temp.view_of(p_name text, p_room uuid) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  select jsonb_build_object('rows', count(*), 'next_room_id', max(r.next_room_id::text), 'next_room_code', max(r.next_room_code))
  into v from api.rooms r where r.id = p_room;
  perform tests.clear_authentication();
  return v;
end $$;

-- Room A: a locked room with every setting off its default, a1 host with moods and a service.
select pg_temp.mk('a', 3);
update public.rooms set
  state = 'done', started_at = now() - interval '10 minutes', decided_at = now(),
  service_rule = 'every_member', offer_kinds = '{subscription}', runtime_max = 120,
  seen_rule = 'allow_rewatch', quality = 'hidden_gems', max_age = 12, reveal = 'blind',
  max_players = 6, include_free_services = false, locked = true
where id = pg_temp.rid('a');
update public.room_members set mood_slugs = '{cosy,funny}' where id = tests.member_id('a1', pg_temp.rid('a'));
insert into public.profile_providers (profile_id, provider_id) values (tests.uid('a1'), 9001);
update public.profiles set avatar_key = 'violet' where id = tests.uid('a1');
update public.room_members set avatar_key = 'violet' where id = tests.member_id('a1', pg_temp.rid('a'));

-- 11 (before any call): with no next room the code is null.
select is(pg_temp.view_of('a2', pg_temp.rid('a')),
  jsonb_build_object('rows', 1, 'next_room_id', null, 'next_room_code', null),
  '11 with no next room, next_room_id and next_room_code are null');

-- 1, 2, 3, 7. The first call.
create temp table first_call as select pg_temp.again('a1', pg_temp.rid('a')) as answer;
grant select on first_call to public;
create temp table nr as
  select (answer->>'room_id')::uuid as id, answer->>'code' as code from first_call;
grant select on nr to public;
select is((select answer->>'status' from first_call), 'ok', '1 a done room: the host gets ok');
select isnt((select id from nr), pg_temp.rid('a'), '1 the room is a new one');
select is((select code::text from public.rooms where id = (select id from nr)), (select code from nr), '1 the answer carries the new code');
select is((select state::text from public.rooms where id = (select id from nr)), 'lobby', '1 the new room is a lobby');
select is(
  (select row(n.mode, n.country, n.service_rule, n.offer_kinds, n.include_free_services, n.runtime_max,
              n.seen_rule, n.quality, n.max_age, n.reveal, n.max_players)::text
   from public.rooms n where n.id = (select id from nr)),
  (select row(o.mode, o.country, o.service_rule, o.offer_kinds, o.include_free_services, o.runtime_max,
              o.seen_rule, o.quality, o.max_age, o.reveal, o.max_players)::text
   from public.rooms o where o.id = pg_temp.rid('a')),
  '1 every copied setting equals the old room''s');
select is((select host_id from public.rooms where id = (select id from nr)), tests.uid('a1'), '1 the caller is the room''s host');
select is((select locked from public.rooms where id = pg_temp.rid('a')), true, '2 control: the old room was locked');
select is((select locked from public.rooms where id = (select id from nr)), false, '2 the new room is unlocked');

select is((select count(*) from public.room_members where room_id = (select id from nr)), 1::bigint, '3 the new room has one seat');
select is(
  (select row(m.role, m.display_name, m.avatar_key, m.mood_slugs, m.provider_ids)::text
   from public.room_members m where m.room_id = (select id from nr)),
  row('host'::public.member_role, 'a1', 'violet', '{cosy,funny}'::text[], '{9001}'::integer[])::text,
  '3 the new host seat has the host role, the profile''s name, avatar and services, and the old seat''s moods');
select is((select provider_ids from public.rooms where id = (select id from nr)), '{9001}'::integer[],
  '3 the room''s providers are refreshed from the seat (free services off, as copied)');
select is((select count(*) from public.room_models where room_id = (select id from nr)), 1::bigint, '3 the new room has its room_models row');
select is((select next_room_id from public.rooms where id = pg_temp.rid('a')), (select id from nr), '1 the old room points at the new one');

select is(pg_temp.broadcasts(pg_temp.rid('a')), 1::bigint, '7 next_room is on the old room''s topic');
select is((select p->>'room_id' from tests.broadcasts(pg_temp.rid('a'), 'next_room') p), (select id::text from nr), '7 the payload carries room_id');
select is((select p->>'code' from tests.broadcasts(pg_temp.rid('a'), 'next_room') p), (select code from nr), '7 the payload carries code');
select is((select p->>'host_member_id' from tests.broadcasts(pg_temp.rid('a'), 'next_room') p),
  tests.member_id('a1', pg_temp.rid('a'))::text, '7 host_member_id is the caller''s seat in the old room');
select is((select count(*) from tests.broadcasts(pg_temp.rid('a'), 'next_room') p where p ?| array['display_name', 'name']), 0::bigint,
  '7 the payload carries no name');
select is(pg_temp.all_messages((select id from nr)), 0::bigint, '7 nothing is sent on the new room''s topic');

-- 8. A second call while the next room is open.
select is(pg_temp.again('a1', pg_temp.rid('a')), (select answer from first_call), '8 a repeat returns the same room_id and code');
select is(pg_temp.rooms_hosted('a1'), 2::bigint, '8 one new room in total');
select is(pg_temp.broadcasts(pg_temp.rid('a')), 2::bigint, '8 next_room is sent again');

-- 11. api.rooms for the old room's seats.
select is(pg_temp.view_of('a2', pg_temp.rid('a')),
  jsonb_build_object('rows', 1, 'next_room_id', (select id::text from nr), 'next_room_code', (select code from nr)),
  '11 a seat of the old room reads the next room''s id and code');
update public.rooms set state = 'swiping' where id = (select id from nr);
select is(pg_temp.view_of('a3', pg_temp.rid('a'))->>'next_room_code', (select code from nr), '11 the code stays while the next room is swiping');
update public.rooms set state = 'finale' where id = (select id from nr);
select is(pg_temp.view_of('a3', pg_temp.rid('a'))->>'next_room_code', (select code from nr), '11 the code stays during the finale');
update public.rooms set state = 'lobby' where id = (select id from nr);

-- 13. A second player joins the next room with the data the event carried.
select tests.authenticate_as('a2');
create temp table joined as select api.join_room((select code from nr), (select id from nr), 'play_again') as answer;
grant select on joined to public;
select tests.clear_authentication();
select is((select answer->>'status' from joined), 'ok', '13 a second player joins the next room: ok');
select is((select m.joined_via::text from public.room_members m where m.room_id = (select id from nr) and m.profile_id = tests.uid('a2')),
  'play_again', '13 the seat''s joined_via is play_again');

-- 9. The next room ended: a call replaces it.
update public.rooms set state = 'done' where id = (select id from nr);
select is(pg_temp.view_of('a2', pg_temp.rid('a')),
  jsonb_build_object('rows', 1, 'next_room_id', (select id::text from nr), 'next_room_code', null),
  '11 once the next room is done the code is null and the id stays');
create temp table third_call as select pg_temp.again('a1', pg_temp.rid('a')) as answer;
grant select on third_call to public;
select is((select answer->>'status' from third_call), 'ok', '9 an ended next room: ok');
select isnt((select answer->>'room_id' from third_call), (select id::text from nr), '9 a fresh room replaces it');
select is((select next_room_id from public.rooms where id = pg_temp.rid('a')), (select (answer->>'room_id')::uuid from third_call),
  '9 next_room_id points at the fresh room');
select is(pg_temp.view_of('a3', pg_temp.rid('a'))->>'next_room_code', (select answer->>'code' from third_call),
  '11 api.rooms reads the fresh code');

-- 4. A done room with no pick, and an abandoned one.
select pg_temp.mk('i', 2);
update public.rooms set state = 'done', started_at = now() - interval '5 minutes', decided_at = now() where id = pg_temp.rid('i');
select is(pg_temp.again('i1', pg_temp.rid('i'))->>'status', 'ok', '4 a done room with no pick: ok');
select pg_temp.mk('j', 2);
update public.rooms set state = 'abandoned' where id = pg_temp.rid('j');
select is(pg_temp.again('j1', pg_temp.rid('j'))->>'status', 'ok', '4 an abandoned room: ok');

-- 5. A room still in play.
select pg_temp.mk('b', 2);
select is(pg_temp.again('b1', pg_temp.rid('b')), jsonb_build_object('status', 'not_finished'), '5 a lobby: not_finished');
update public.rooms set state = 'dealing' where id = pg_temp.rid('b');
select is(pg_temp.again('b1', pg_temp.rid('b'))->>'status', 'not_finished', '5 dealing: not_finished');
update public.rooms set state = 'swiping' where id = pg_temp.rid('b');
select is(pg_temp.again('b1', pg_temp.rid('b'))->>'status', 'not_finished', '5 swiping: not_finished');
update public.rooms set state = 'finale' where id = pg_temp.rid('b');
select is(pg_temp.again('b1', pg_temp.rid('b'))->>'status', 'not_finished', '5 finale: not_finished');
select is(pg_temp.rooms_hosted('b1'), 1::bigint, '5 no room was created');
select is(pg_temp.broadcasts(pg_temp.rid('b')), 0::bigint, '5 nothing was broadcast');
select is((select next_room_id from public.rooms where id = pg_temp.rid('b')), null, '5 no next_room_id was written');

-- 6. Who may call. Room C: its host left. Room D: its host seat was removed.
select pg_temp.mk('c', 2);
update public.rooms set state = 'done' where id = pg_temp.rid('c');
update public.room_members set left_at = now() where id = tests.member_id('c1', pg_temp.rid('c'));
select pg_temp.mk('d', 2);
update public.rooms set state = 'done' where id = pg_temp.rid('d');
update public.room_members set removed_at = now() where id = tests.member_id('d1', pg_temp.rid('d'));
select is(pg_temp.again('a2', pg_temp.rid('a'))->>'status', 'error 42501', '6 a guest seat raises 42501');
select is(pg_temp.again('d1', pg_temp.rid('d'))->>'status', 'error 42501', '6 a removed host seat raises 42501');
select is(pg_temp.again('c1', pg_temp.rid('c'))->>'status', 'error 42501', '6 a host seat that left raises 42501');
select is(pg_temp.again('x1', pg_temp.rid('a'))->>'status', 'error 42501', '6 a stranger raises 42501');
select is(pg_temp.again('a1', gen_random_uuid())->>'status', 'error 42501', '6 an unknown room raises 42501');
select is(pg_temp.again('a1', null)->>'status', 'error 22023', '6 a null room id raises 22023');
select is(pg_temp.rooms_hosted('c1') + pg_temp.rooms_hosted('d1'), 2::bigint, '6 the refused calls created nothing');
select is(pg_temp.view_of('c2', pg_temp.rid('c')),
  jsonb_build_object('rows', 1, 'next_room_id', null, 'next_room_code', null), '11 a room with no Play again has no next room');
select is(pg_temp.view_of('d1', pg_temp.rid('d'))->>'rows', '0', '11 a removed seat reads no row');

-- 10. A solo room.
select pg_temp.mk('s', 1);
update public.rooms set mode = 'solo', state = 'done' where id = pg_temp.rid('s');
select is(pg_temp.again('s1', pg_temp.rid('s')), jsonb_build_object('status', 'unknown_mode'), '10 a solo room: unknown_mode');
select is(pg_temp.rooms_hosted('s1'), 1::bigint, '10 nothing was created');

-- The host's profile has no name.
select pg_temp.mk('n', 2);
update public.rooms set state = 'done' where id = pg_temp.rid('n');
update public.profiles set display_name = '' where id = tests.uid('n1');
select is(pg_temp.again('n1', pg_temp.rid('n')), jsonb_build_object('status', 'name_required'), 'an empty name: name_required');
select is(pg_temp.rooms_hosted('n1'), 1::bigint, 'an empty name: nothing was created');

-- 12. rooms.stats.next_room_id, with write_room_stats before and after.
select pg_temp.mk('g', 2);
update public.rooms set state = 'done', started_at = now() - interval '4 minutes', decided_at = now() where id = pg_temp.rid('g');
select internal.write_room_stats(pg_temp.rid('g'));
select is((select stats->'next_room_id' from public.rooms where id = pg_temp.rid('g')), 'null'::jsonb,
  '12 with no Play again, stats.next_room_id is null');
create temp table g_call as select pg_temp.again('g1', pg_temp.rid('g')) as answer;
select is((select stats->>'next_room_id' from public.rooms where id = pg_temp.rid('g')), (select answer->>'room_id' from g_call),
  '12 write_room_stats ran before: the call merges next_room_id into stats');
select internal.write_room_stats(pg_temp.rid('g'));
select is((select stats->>'next_room_id' from public.rooms where id = pg_temp.rid('g')), (select answer->>'room_id' from g_call),
  '12 write_room_stats ran after: next_room_id is still set');
select is((select stats->>'outcome' from public.rooms where id = pg_temp.rid('g')), 'no_pick', '12 the other stats are unchanged');

select * from finish();
rollback;

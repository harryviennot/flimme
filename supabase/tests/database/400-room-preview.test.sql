-- M4.19: api.room_preview(code, ref) tells a link holder who invited them, without a seat.
-- (data-model.md#create-and-join, security.md#room-codes-joining-and-the-host)

begin;
select plan(40);

-- One preview as a named player, back to the superuser afterwards.
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

create function pg_temp.try_join(p_name text, p_code text) returns text
language plpgsql as $$
declare v_status text;
begin
  perform tests.authenticate_as(p_name);
  v_status := api.join_room(p_code)->>'status';
  perform tests.clear_authentication();
  return v_status;
end
$$;

-- Room A (a1 host, a2) is done; room B (b1 host, b2) reuses A's code. Room C (c1 host, c2) is open.
create temp table fx as
select (a->>'room_id')::uuid as a_id, a->>'code' as code from (select tests.create_room(2, 'quick_match', 'FR', 'a') as a) s;
update public.rooms set state = 'done' where id = (select a_id from fx);
select tests.create_room(2, 'quick_match', 'FR', 'b');
create temp table fx2 as select tests.room_id() as b_id;
update public.rooms set code = (select code from fx) where id = (select b_id from fx2);
select tests.create_room(2, 'quick_match', 'FR', 'c');
create temp table fx3 as select tests.room_id() as c_id, tests.room_code() as c_code;
grant select on fx, fx2, fx3 to public;
update public.room_members set avatar_key = 'blue'
  where room_id = (select c_id from fx3) and role = 'host';
select tests.create_player('g1');
select tests.create_player('g2');
select tests.create_player('g3');
select tests.create_player('g4');
select set_config('request.headers', '', true);

-- 1. A named non-member gets the host's name and avatar, the count, and seated false.
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3)),
  jsonb_build_object('status', 'ok', 'state', 'lobby', 'host_name', 'c1', 'host_avatar_key', 'blue',
                     'players', 2, 'max_players', (select max_players from public.rooms where id = (select c_id from fx3)),
                     'seated', false),
  '1 a lobby room answers ok with the host, the count and seated false');

-- 2. The right code with another room's id, or a random uuid.
select is(pg_temp.preview('g1', (select c_code from fx3), (select b_id from fx2))->>'status', 'closed',
  '2 the right code with another room''s id answers closed');
select is(pg_temp.preview('g1', (select c_code from fx3), gen_random_uuid())->>'status', 'closed',
  '2 the right code with a random uuid answers closed');
select is(pg_temp.preview('g1', '000000', gen_random_uuid())->>'status', 'closed',
  '2 an unused code answers closed');

-- 3. A done room whose code another room reuses.
select is(pg_temp.preview('g1', (select code from fx), (select a_id from fx))->>'status', 'closed',
  '3 the done room''s id with the reused code answers closed');
select is(pg_temp.preview('g1', (select code from fx), (select b_id from fx2))->>'status', 'ok',
  '3 the newer room''s id with the reused code answers ok');

delete from public.rate_limits;  -- g1 asks a lot: clear the window between groups
-- 4. Every state.
update public.rooms set state = 'done' where id = (select c_id from fx3);
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'status', 'closed', '4 done answers closed');
update public.rooms set state = 'abandoned' where id = (select c_id from fx3);
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'status', 'closed', '4 abandoned answers closed');
update public.rooms set state = 'finale' where id = (select c_id from fx3);
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'status', 'in_finale', '4 finale answers in_finale');
update public.rooms set state = 'dealing' where id = (select c_id from fx3);
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'state', 'dealing', '4 dealing answers ok with that state');
update public.rooms set state = 'swiping' where id = (select c_id from fx3);
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'state', 'swiping', '4 swiping answers ok with that state');
update public.rooms set state = 'lobby' where id = (select c_id from fx3);

-- 5. No reference, no preview, and nothing counted.
select tests.authenticate_as('g2');
select throws_ok($$select api.room_preview((select c_code from fx3), null)$$, '22023', null,
  '5 a null reference raises 22023');
select throws_ok($$select api.room_preview(null, (select c_id from fx3))$$, '22023', null,
  '5 a null code raises 22023');
select tests.clear_authentication();
select is((select count(*) from public.rate_limits where key like 'preview:%' || tests.uid('g2')::text), 0::bigint,
  '5 and no rate limit row was written');

delete from public.rate_limits;  -- g1 asks a lot: clear the window between groups
-- 6. Nobody but the host is named; the keys are exactly the seven.
select tests.create_player('Zed');
select tests.authenticate_as('Zed');
select api.join_room((select c_code from fx3));
select tests.clear_authentication();
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))::text !~ 'Zed', true,
  '6 the answer does not contain a guest''s name');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))) k),
  array['host_avatar_key', 'host_name', 'max_players', 'players', 'seated', 'state', 'status'],
  '6 and its keys are exactly the seven');

-- 7. A seat that left is not counted (3 seated now: c1, c2, Zed).
select is((pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'players')::int, 3, '7 three seated');
update public.room_members set left_at = now() where profile_id = tests.uid('Zed');
select is((pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'players')::int, 2,
  '7 a seat that left is not counted');

delete from public.rate_limits;  -- g1 asks a lot: clear the window between groups
-- 8. A full room: full, unless the caller holds a seat.
update public.rooms set max_players = 2 where id = (select c_id from fx3);
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3)), jsonb_build_object('status', 'full', 'max_players', 2),
  '8 a full room answers full with max_players');
select is(pg_temp.preview('c2', (select c_code from fx3), (select c_id from fx3))->>'seated', 'true',
  '8 a seated caller gets ok with seated true');
update public.rooms set state = 'finale' where id = (select c_id from fx3);
select is(pg_temp.preview('c2', (select c_code from fx3), (select c_id from fx3))->>'status', 'ok',
  '8 a seated caller gets ok in the finale too');
select is(pg_temp.preview('g1', (select c_code from fx3), (select c_id from fx3))->>'status', 'in_finale',
  '8 a stranger in the finale gets in_finale');
update public.rooms set state = 'lobby', max_players = 10 where id = (select c_id from fx3);

-- 9. A removed seat is not a seat.
update public.room_members set removed_at = now() where profile_id = tests.uid('c2');
select is(pg_temp.preview('c2', (select c_code from fx3), (select c_id from fx3))->>'status', 'removed',
  '9 a removed seat answers removed (M4.2)');
update public.room_members set removed_at = null where profile_id = tests.uid('c2');

-- 10. A player with no name still gets ok.
update public.profiles set display_name = '' where id = tests.uid('g3');
select is(pg_temp.preview('g3', (select c_code from fx3), (select c_id from fx3))->>'status', 'ok',
  '10 a player with no name gets ok, never name_required');

-- 11. Read only.
update public.profiles set last_seen_at = now() - interval '2 days' where id = tests.uid('g4');
create temp table before_state as
select (select count(*) from public.room_members) as seats,
       (select count(*) from realtime.messages) as messages,
       (select count(*) from tests.queued('letterboxd_sync')) as queued,
       (select last_seen_at from public.profiles where id = tests.uid('g4')) as seen;
select pg_temp.preview('g4', (select c_code from fx3), (select c_id from fx3));
select is((select count(*) from public.room_members), (select seats from before_state), '11 no new seat');
select is((select count(*) from realtime.messages), (select messages from before_state), '11 no broadcast');
select is((select last_seen_at from public.profiles where id = tests.uid('g4')), (select seen from before_state),
  '11 last_seen_at unchanged');
select is((select count(*) from tests.queued('letterboxd_sync')), (select queued from before_state), '11 nothing queued');

delete from public.rate_limits;  -- g1 asks a lot: clear the window between groups
-- 12. Ten per profile; thirty per address across profiles.
select tests.create_player('r1');
select is((select count(*) filter (where pg_temp.preview('r1', (select c_code from fx3), (select c_id from fx3))->>'status' = 'ok')
           from generate_series(1, 10)), 10::bigint, '12 ten previews answer ok');
select is(pg_temp.preview('r1', (select c_code from fx3), (select c_id from fx3))->>'status', 'rate_limited',
  '12 the 11th answers rate_limited');
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.50"}', true);
select tests.create_player('s1'); select tests.create_player('s2'); select tests.create_player('s3'); select tests.create_player('s4');
select is((select count(*) filter (where pg_temp.preview('s' || (1 + (i % 3)), (select c_code from fx3), (select c_id from fx3))->>'status' = 'ok')
           from generate_series(1, 30) i), 30::bigint, '12 thirty previews from one address across profiles answer ok');
select is(pg_temp.preview('s4', (select c_code from fx3), (select c_id from fx3))->>'status', 'rate_limited',
  '12 the 31st from that address answers rate_limited');
select set_config('request.headers', '', true);

-- 13. Separate buckets from join.
select tests.create_player('j1');
select is((select count(*) filter (where pg_temp.preview('j1', (select c_code from fx3), (select c_id from fx3))->>'status' = 'ok')
           from generate_series(1, 10)), 10::bigint, '13 ten previews');
select is(pg_temp.try_join('j1', (select c_code from fx3)), 'ok', '13 join_room from the same profile still answers ok');
select tests.create_player('j2');
select is((select count(*) filter (where pg_temp.preview('j2', '000000', gen_random_uuid())->>'status' = 'closed')
           from generate_series(1, 5)), 5::bigint, '13 five closed previews');
select is(pg_temp.try_join('j2', '000001'), 'not_found', '13 join_room with a wrong code answers not_found, not rate_limited');

-- 14. A host handover shows the new host.
update public.room_members set role = 'guest' where room_id = (select c_id from fx3) and profile_id = tests.uid('c1');
update public.room_members set role = 'host' where room_id = (select c_id from fx3) and profile_id = tests.uid('c2');
select is(pg_temp.preview('g4', (select c_code from fx3), (select c_id from fx3))->>'host_name', 'c2',
  '14 after a handover the preview shows the new host');

-- 15. Phones only.
select is(has_function_privilege('anon', 'api.room_preview(text, uuid)', 'execute'), false, '15 anon cannot execute it');
select is(has_function_privilege('authenticated', 'api.room_preview(text, uuid)', 'execute'), true, '15 authenticated can');

-- 16. A user with no profile raises 42501.
select set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
  'aud', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select api.room_preview('000000', gen_random_uuid())$$, '42501', null,
  '16 no profile raises 42501');
select tests.clear_authentication();

select * from finish();
rollback;

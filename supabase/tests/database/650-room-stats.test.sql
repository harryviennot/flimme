-- M6.8: internal.write_room_stats writes rooms.stats when a room ends (analytics.md#changes-this-asks-elsewhere,
-- game-modes.md#how-a-game-ends), and the room_finished queue gets a message for every ended room.
-- Counts and timings only, never a name.

begin;
select plan(25);

-- M6.34: these rooms end on a match, so every mode picks at its first match.
update public.game_modes set defaults = defaults || '{"matches_to_end": 1}';

select tests.create_catalog(40);

-- A swiping room of p_players seats, started 100 seconds ago. Returns its id.
create function pg_temp.room(p_players integer, p_prefix text) returns uuid language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping');
  update public.rooms set started_at = now() - interval '100 seconds' where id = tests.room_id();
  return tests.room_id();
end
$$;

create function pg_temp.stats(p_room uuid) returns jsonb language sql as $$
  select r.stats from public.rooms r where r.id = p_room
$$;

create function pg_temp.queued_for(p_room uuid) returns bigint language sql as $$
  select count(*) from tests.queued('room_finished') q where (q->>'room_id')::uuid = p_room
$$;

-- 1. An instant match: outcome match, the pick's present_count, no finale reason.
create temp table r1 as select pg_temp.room(3, 'a') as id;
select tests.vote('a1', 1, 'like');
select tests.vote('a2', 1, 'like');
select tests.vote('a3', 1, 'like');
select is(
  (select r.state::text from public.rooms r where r.id = (select id from r1)),
  'done',
  'M6.8 positive control: three likes on one film end the room'
);
create temp table s1 as select internal.write_room_stats((select id from r1)) as s;
select is((select s->>'outcome' from s1), 'match', 'M6.8 an instant match has the outcome match');
select is(
  (select (s->>'present_at_pick')::int from s1),
  (select m.present_count::int from public.matches m where m.room_id = (select id from r1) and m.pick_order = 1),
  'M6.8 present_at_pick is the pick''s present_count'
);
select is(
  (select (s->>'seconds_to_pick')::int from s1),
  (select round(extract(epoch from r.decided_at - r.started_at))::int from public.rooms r where r.id = (select id from r1)),
  'M6.8 seconds_to_pick is decided_at minus started_at in whole seconds'
);
select ok(
  (select (s->>'seconds_to_pick')::int >= 99 from s1),
  'M6.8 seconds_to_pick counts from the start (about 100 seconds here)'
);
select ok((select s ? 'finale_reason' and s->'finale_reason' = 'null'::jsonb from s1), 'M6.8 an instant match has a null finale_reason');
select is(pg_temp.stats((select id from r1)), (select s from s1), 'M6.8 the function stores what it returns in rooms.stats');

-- 2. A finale pick.
create temp table r2 as select pg_temp.room(2, 'b') as id;
insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
values ((select id from r2), tests.film(3), 'finale', 2, 2, 1);
update public.rooms set state = 'done', finale_reason = 'time', decided_at = now(), ended_at = now()
where id = (select id from r2);
create temp table s2 as select internal.write_room_stats((select id from r2)) as s;
select is(
  (select s->>'outcome' || '/' || (s->>'finale_reason') from s2),
  'finale/time',
  'M6.8 a finale pick has the outcome finale and its finale_reason'
);

-- 3. No pick.
create temp table r3 as select pg_temp.room(2, 'c') as id;
update public.rooms set state = 'done', finale_reason = 'cards', ended_at = now() where id = (select id from r3);
create temp table s3 as select internal.write_room_stats((select id from r3)) as s;
select is((select s->>'outcome' from s3), 'no_pick', 'M6.8 a finished room without a pick is no_pick');
select ok(
  (select s->'seconds_to_pick' = 'null'::jsonb and s->'present_at_pick' = 'null'::jsonb from s3),
  'M6.8 no pick means seconds_to_pick and present_at_pick are null'
);
select is((select s->>'finale_reason' from s3), 'cards', 'M6.8 no pick still records why the finale started');

-- 4. Abandoned after the start, and in the lobby.
create temp table r4 as select pg_temp.room(2, 'd') as id;
select is(pg_temp.queued_for((select id from r4)), 0::bigint, 'M6.8 positive control: a swiping room has no room_finished message');
update public.rooms set state = 'abandoned', ended_at = now() where id = (select id from r4);
select is(pg_temp.queued_for((select id from r4)), 1::bigint, 'M6.8 a room abandoned after the start queues one room_finished');
create temp table s4 as select internal.write_room_stats((select id from r4)) as s;
select is((select s->>'outcome' from s4), 'abandoned', 'M6.8 an abandoned room has the outcome abandoned');

create temp table r4b as select (tests.create_room(2, 'quick_match', 'FR', 'e')->>'room_id')::uuid as id;
update public.rooms set state = 'abandoned', ended_at = now() where id = (select id from r4b);
select is(pg_temp.queued_for((select id from r4b)), 0::bigint, 'M6.8 a lobby abandoned before the start queues nothing');

-- 5. Median over seats that swiped; seats at 0 are left out.
create temp table r5 as select pg_temp.room(4, 'f') as id;
update public.room_members set swipe_count = 10 where id = tests.member_id('f1', (select id from r5));
update public.room_members set swipe_count = 21 where id = tests.member_id('f2', (select id from r5));
update public.room_members set swipe_count = 40 where id = tests.member_id('f3', (select id from r5));
update public.rooms set state = 'done', ended_at = now() where id = (select id from r5);
create temp table s5 as select internal.write_room_stats((select id from r5)) as s;
select is((select (s->>'swipes_per_seat')::numeric from s5), 21::numeric, 'M6.8 swipes_per_seat is the median over seats that swiped');
select is((select (s->>'players')::int from s5), 3, 'M6.8 players counts the seats that swiped (the 0 seat is left out)');
create temp table r5b as select pg_temp.room(2, 'g') as id;
update public.room_members set swipe_count = 10 where id = tests.member_id('g1', (select id from r5b));
update public.room_members set swipe_count = 21 where id = tests.member_id('g2', (select id from r5b));
update public.rooms set state = 'done', ended_at = now() where id = (select id from r5b);
select is((internal.write_room_stats((select id from r5b))->>'swipes_per_seat')::numeric, 15.5::numeric, 'M6.8 an even count takes the middle of the two');
select ok(
  (select s->'swipes_per_seat' = 'null'::jsonb and (s->>'players')::int = 0 from s3),
  'M6.8 nobody swiped means swipes_per_seat null and no players'
);

-- 6. Twice is safe; a swiping room is skipped.
select is(internal.write_room_stats((select id from r5)), (select s from s5), 'M6.8 called twice, the same stats');
select is(pg_temp.stats((select id from r5)), (select s from s5), 'M6.8 the second call leaves rooms.stats as it was');
create temp table r6 as select pg_temp.room(2, 'h') as id;
select is(internal.write_room_stats((select id from r6)), null::jsonb, 'M6.8 a swiping room answers null');
select is(pg_temp.stats((select id from r6)), null::jsonb, 'M6.8 a swiping room gets no stats');

-- 7. The backfill: one message per ended room without stats.
delete from pgmq.q_room_finished;
update public.rooms set stats = '{}'::jsonb where id = (select id from r1);
update public.rooms set stats = null where id in (select id from r2 union all select id from r4);
select internal.requeue_room_stats();
select is(
  pg_temp.queued_for((select id from r2)) || '/' || pg_temp.queued_for((select id from r4)) || '/'
    || pg_temp.queued_for((select id from r1)) || '/' || pg_temp.queued_for((select id from r4b)) || '/'
    || pg_temp.queued_for((select id from r6)),
  '1/1/0/0/0',
  'M6.8 the backfill queues done and started-then-abandoned rooms without stats, and no others'
);

-- 8. Who may call it.
select is(
  has_function_privilege('app_server', 'internal.write_room_stats(uuid)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'internal.write_room_stats(uuid)', 'execute')::text
    || '/' || has_function_privilege('anon', 'internal.write_room_stats(uuid)', 'execute')::text,
  'true/false/false',
  'M6.8 app_server may execute write_room_stats; authenticated and anon may not'
);

select * from finish();
rollback;

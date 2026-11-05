-- M9.3: the five headline metric views in the analytics schema (analytics.md#every-metric).
-- Rooms with known timings are built by setting started_at, decided_at and stats, and by
-- inserting swipe_log rows directly.

begin;
select plan(26);

select tests.create_catalog(3);

-- A room of p_players, started at p_start, decided p_after later (null: not decided), with these stats.
create function pg_temp.room(p_prefix text, p_start timestamptz, p_after interval, p_stats jsonb, p_players integer default 2)
returns void language plpgsql as $$
begin
  perform tests.create_room(p_players, 'quick_match', 'FR', p_prefix);
  update public.rooms
  set started_at = p_start, decided_at = p_start + p_after, stats = p_stats
  where id = tests.room_id();
end
$$;

create function pg_temp.stats(p_outcome text, p_players integer default 2) returns jsonb language sql as $$
  select jsonb_build_object('outcome', p_outcome, 'players', p_players)
$$;

create function pg_temp.vote(p_member uuid, p_at timestamptz, p_action public.swipe_action default 'vote') returns void
language sql as $$
  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer, created_at)
  select m.room_id, m.id, tests.film(1), p_action, 'like', p_at from public.room_members m where m.id = p_member
$$;

-- 1. time_to_pick: picks after 2, 4 and 9 minutes.
select pg_temp.room('a', '2026-03-02 10:00+00', interval '2 minutes', pg_temp.stats('match'));
select pg_temp.room('b', '2026-03-02 10:00+00', interval '4 minutes', pg_temp.stats('match'));
select pg_temp.room('c', '2026-03-02 10:00+00', interval '9 minutes', pg_temp.stats('finale'));

select is((select rooms from analytics.time_to_pick where day = '2026-03-02' and group_size = '2'), 3::bigint,
  'time_to_pick counts the three rooms with a pick');
select is((select median_seconds from analytics.time_to_pick where day = '2026-03-02' and group_size = '2'), 240::double precision,
  'time_to_pick: the median of 2, 4 and 9 minutes is 4 minutes');
select is((select p90_seconds from analytics.time_to_pick where day = '2026-03-02' and group_size = '2'),
  (select percentile_cont(0.9) within group (order by s) from unnest(array[120, 240, 540]::double precision[]) s),
  'time_to_pick: the 90th percentile is percentile_cont(0.9)');
select is((select country || '/' || mode from analytics.time_to_pick where day = '2026-03-02' and group_size = '2'), 'FR/quick_match',
  'time_to_pick is split by country and mode');

-- 2. room_outcomes: match, finale, no_pick, abandoned and one started without stats.
select pg_temp.room('d', '2026-03-03 10:00+00', interval '2 minutes', pg_temp.stats('match'));
select pg_temp.room('e', '2026-03-03 10:00+00', interval '6 minutes', pg_temp.stats('finale'));
select pg_temp.room('f', '2026-03-03 10:00+00', null, pg_temp.stats('no_pick'));
select pg_temp.room('g', '2026-03-03 10:00+00', null, pg_temp.stats('abandoned'));
select pg_temp.room('h', '2026-03-03 10:00+00', null, null);

select is((select started from analytics.room_outcomes where day = '2026-03-03' and group_size = '2'), 4::bigint,
  'room_outcomes: four settled rooms');
select is((select array[match, finale, no_pick, abandoned] from analytics.room_outcomes where day = '2026-03-03' and group_size = '2'),
  array[1, 1, 1, 1]::bigint[], 'room_outcomes counts each outcome');
select is((select pick_share from analytics.room_outcomes where day = '2026-03-03' and group_size = '2'), 0.5::numeric,
  'room_outcomes: the pick share is 2 of 4 settled');
select is((select sum(pending) from analytics.room_outcomes where day = '2026-03-03'), 1::numeric,
  'room_outcomes: the room without stats is pending');
select is((select array[no_pick_share, abandoned_share] from analytics.room_outcomes where day = '2026-03-03' and group_size = '2'),
  array[0.25, 0.25]::numeric[], 'room_outcomes: no_pick and abandoned shares');
select is((select array[picks_within_5_min::numeric, pick_within_5_min_share] from analytics.room_outcomes where day = '2026-03-03' and group_size = '2'),
  array[1, 0.25]::numeric[], 'room_outcomes: one pick under 5 minutes, out of 4 settled');
select is((select instant_match_share from analytics.room_outcomes where day = '2026-03-03' and group_size = '2'), 0.5::numeric,
  'room_outcomes: instant matches are 1 of 2 picks');
select is((select sum(started) from analytics.room_outcomes where day = '2026-03-03'), 5::numeric,
  'room_outcomes: the pending room is also a started room');

-- 3 and 4. A host, a link guest and a code guest; first votes 3, 1 and 2 minutes after their profiles were made.
select pg_temp.room('o', '2026-03-09 10:00+00', interval '5 minutes', pg_temp.stats('match'), 3);
update public.profiles set created_at = '2026-03-09 09:00+00' where id in (select profile_id from public.room_members where room_id = tests.room_id());
update public.room_members set joined_via = 'link', link_opened_at = '2026-03-09 09:01:20+00'
where id = tests.member_id('o2');
update public.room_members set joined_via = 'code' where id = tests.member_id('o3');
select pg_temp.vote(tests.member_id('o1'), '2026-03-09 09:03+00');
select pg_temp.vote(tests.member_id('o2'), '2026-03-09 09:02+00');
-- The link guest's vote was undone and redone: the first vote still counts.
select pg_temp.vote(tests.member_id('o2'), '2026-03-09 09:02:10+00', 'undo');
select pg_temp.vote(tests.member_id('o2'), '2026-03-09 09:05+00');
select pg_temp.vote(tests.member_id('o3'), '2026-03-09 09:02+00');

select is((select median_seconds from analytics.onboarding_time where week = '2026-03-09' and entry = 'host'), 180::double precision,
  'onboarding_time: the host took 3 minutes');
select is((select median_seconds from analytics.onboarding_time where week = '2026-03-09' and entry = 'guest_link'), 120::double precision,
  'onboarding_time: the link guest took 2 minutes');
select is((select median_seconds from analytics.onboarding_time where week = '2026-03-09' and entry = 'guest_code'), 120::double precision,
  'onboarding_time: the code guest took 2 minutes');
select is((select count(*) from analytics.onboarding_time where week = '2026-03-09'), 3::bigint,
  'onboarding_time: three splits that week');

select is((select seats from analytics.link_to_first_swipe where day = '2026-03-09'), 1::bigint,
  'link_to_first_swipe counts the link seat only');
select is((select median_seconds from analytics.link_to_first_swipe where day = '2026-03-09'), 40::double precision,
  'link_to_first_swipe: 40 seconds from the tap to the first vote, an undone vote included');

-- 5. second_game: x1 plays again after 10 days, x2 after 20 days.
select pg_temp.room('x', '2026-03-16 10:00+00', interval '5 minutes', pg_temp.stats('match'));
update public.room_members set joined_at = '2026-03-16 10:00+00' where room_id = tests.room_id();
select set_config('tests.room_x', tests.room_id()::text, true);
select pg_temp.room('y', '2026-03-26 10:00+00', interval '5 minutes', pg_temp.stats('match'));
update public.room_members set joined_at = '2026-03-26 10:00+00' where room_id = tests.room_id();
insert into public.room_members (room_id, profile_id, display_name, avatar_key, joined_at)
select tests.room_id(), (select profile_id from public.room_members where id = tests.member_id('x1', current_setting('tests.room_x')::uuid)),
       'x1', 'default', '2026-03-26 10:00+00';
select pg_temp.room('z', '2026-04-05 10:00+00', interval '5 minutes', pg_temp.stats('match'));
update public.room_members set joined_at = '2026-04-05 10:00+00' where room_id = tests.room_id();
insert into public.room_members (room_id, profile_id, display_name, avatar_key, joined_at)
select tests.room_id(), (select profile_id from public.room_members where id = tests.member_id('x2', current_setting('tests.room_x')::uuid)),
       'x2', 'default', '2026-04-05 10:00+00';

select is((select array[new_players, returned] from analytics.second_game where cohort_week = '2026-03-16'), array[2, 1]::bigint[],
  'second_game: 1 of 2 new players returned within 14 days');
select is((select share from analytics.second_game where cohort_week = '2026-03-16'), 0.5::numeric, 'second_game: the share is one half');
select is((select is_complete from analytics.second_game where cohort_week = '2026-03-16'), true, 'second_game: an old week is complete');

-- 6. Seats of a deleted player count in the room totals and in no per-player view.
select pg_temp.room('k', '2026-05-04 10:00+00', interval '1 minute', pg_temp.stats('match'));
update public.room_members set joined_at = '2026-05-04 10:00+00', joined_via = 'link', link_opened_at = '2026-05-04 09:59+00'
where room_id = tests.room_id();
select pg_temp.vote(m.id, '2026-05-04 10:00:30+00') from public.room_members m where m.room_id = tests.room_id();
update public.room_members set profile_id = null where room_id = tests.room_id();

select is((select started from analytics.room_outcomes where day = '2026-05-04'), 1::bigint,
  'a deleted player''s room counts in room_outcomes');
select is(
  (select count(*) from analytics.onboarding_time where week = '2026-05-04')
  + (select count(*) from analytics.link_to_first_swipe where day = '2026-05-04')
  + (select count(*) from analytics.second_game where cohort_week = '2026-05-04'),
  0::bigint, 'a deleted player''s seat is in no per-player view');

-- 7. No ids, names, codes or titles in any column.
select is((select count(*) from information_schema.views where table_schema = 'analytics'), 5::bigint, 'five views in analytics');
select is((select array_agg(table_name || '.' || column_name) from information_schema.columns
           where table_schema = 'analytics'
             and (data_type = 'uuid' or column_name ~ '(^|_)(id|ids|name|code|title|email)(_|$)')),
  null::text[], 'no analytics column is a uuid or named like an id, name, code or title');

-- 8. Nobody reads them.
select is((select count(*) from unnest(array['anon', 'authenticated', 'app_server', 'app_http']) r,
                 unnest(array['time_to_pick', 'room_outcomes', 'onboarding_time', 'link_to_first_swipe', 'second_game']) v
           where has_table_privilege(r, format('analytics.%I', v), 'select') or has_schema_privilege(r, 'analytics', 'usage')),
  0::bigint, 'phones and the server logins can neither use the schema nor select from the views');

select * from finish();
rollback;

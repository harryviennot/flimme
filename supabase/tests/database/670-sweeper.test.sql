-- M6.6: internal.sweep_room, one room's checks of the every-minute sweeper
-- (game-modes.md#internalsweep_rooms). A procedure that commits can't run inside a test, so the
-- tests call sweep_room; internal.sweep_rooms and the cron job are in 675-sweeper-cron.stack.test.sql.
-- Times are moved back with update. One action per room per run, in the order of the spec.

begin;
select plan(73);

select tests.create_catalog(25);
select tests.use_deck_engine('sql');

create function pg_temp.sweep() returns text language sql as $$ select internal.sweep_room(tests.room_id()) $$;

create function pg_temp.state() returns text language sql as $$
  select r.state::text from public.rooms r where r.id = tests.room_id()
$$;

create function pg_temp.broadcast_count(p_event text, p_key text default null, p_value text default null)
returns bigint language sql as $$
  select count(*) from tests.broadcasts(tests.room_id(), p_event) b
  where p_key is null or b->>p_key = p_value
$$;

-- A swiping game whose seats joined before the start, p_players seats named <prefix>1, 2, ...
create function pg_temp.game(p_players integer, p_prefix text) returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping');
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds', expires_at = now() + interval '50 minutes'
  where id = tests.room_id();
end
$$;

-- Films 1 to p_n have one like each (a shortlist of liked films, no vote needed).
create function pg_temp.like_films(p_n integer) returns void language sql as $$
  update public.room_cards set like_count = 1
  where room_id = tests.room_id() and title_id in (select tests.film(n) from generate_series(1, p_n) n)
$$;

create function pg_temp.round_id() returns uuid language sql as $$
  select ro.id from public.rounds ro where ro.room_id = tests.room_id() order by ro.seq desc limit 1
$$;

-- A game in the finale: four liked films, the room's own rules open the vote.
create function pg_temp.finale(p_players integer, p_prefix text) returns void language plpgsql as $$
begin
  perform pg_temp.game(p_players, p_prefix);
  perform pg_temp.like_films(4);
  update public.rooms set started_at = now() - interval '400 seconds' where id = tests.room_id();
  if pg_temp.sweep() <> 'finale' or pg_temp.state() <> 'finale' then
    raise exception 'pg_temp.finale: the finale did not open';
  end if;
  update public.rooms set started_at = now() - interval '100 seconds' where id = tests.room_id();
end
$$;

-- ---------------------------------------------------------------------------------------------
-- 1. A lobby past expires_at is abandoned; at 2 h 59 min it is left alone.
-- ---------------------------------------------------------------------------------------------
select tests.create_room(2, 'quick_match', 'FR', 'lb');
update public.rooms set expires_at = now() + interval '1 minute' where id = tests.room_id();
select is(pg_temp.sweep(), 'nothing', 'a lobby a minute from expiring is left alone');
select is(pg_temp.state(), 'lobby', 'and stays a lobby');

update public.rooms set expires_at = now() - interval '1 second' where id = tests.room_id();
select is(pg_temp.sweep(), 'abandoned', 'a lobby past expires_at is abandoned');
select is(pg_temp.state(), 'abandoned', 'the room is abandoned');
select isnt((select ended_at from public.rooms where id = tests.room_id()), null, 'with an end time');
select is(pg_temp.broadcast_count('state_changed', 'state', 'abandoned'), 1::bigint, 'and state_changed says so');

-- ---------------------------------------------------------------------------------------------
-- 2. A dealing room past expires_at is abandoned.
-- ---------------------------------------------------------------------------------------------
select tests.deal_game(2, 'dx', 'dealing');
update public.rooms set expires_at = now() - interval '1 second', dealing_at = now() where id = tests.room_id();
select is(pg_temp.sweep(), 'abandoned', 'a dealing room past expires_at is abandoned');
select is(pg_temp.state(), 'abandoned', 'it is abandoned');

-- ---------------------------------------------------------------------------------------------
-- 3. A silent host hands the role over (game-modes.md#who-counts-presence-joining-and-leaving).
-- ---------------------------------------------------------------------------------------------
select tests.create_room(3, 'quick_match', 'FR', 'ho');
update public.room_members set joined_at = now() - interval '10 minutes' where id = tests.member_id('ho1');
update public.room_members set joined_at = now() - interval '5 minutes' where id = tests.member_id('ho2');
update public.room_members set joined_at = now() - interval '1 minute' where id = tests.member_id('ho3');
update public.room_members set last_active_at = now() - interval '119 seconds' where id = tests.member_id('ho1');
select is(pg_temp.sweep(), 'nothing', 'a host silent for 1 min 59 s keeps the role');

update public.room_members set last_active_at = now() - interval '121 seconds' where id = tests.member_id('ho1');
select is(pg_temp.sweep(), 'host_changed', 'a host silent for 2 min 1 s hands the role over');
select is((select m.role::text from public.room_members m where m.id = tests.member_id('ho2')), 'host',
          'to the longest-seated present player');
select is((select m.role::text from public.room_members m where m.id = tests.member_id('ho1')), 'guest',
          'the old host becomes a guest');
select is((select r.host_id from public.rooms r where r.id = tests.room_id()),
          (select m.profile_id from public.room_members m where m.id = tests.member_id('ho2')),
          'rooms.host_id follows');
select is(pg_temp.broadcast_count('host_changed', 'member_id', tests.member_id('ho2')::text), 1::bigint,
          'host_changed names the new host seat');
select is(pg_temp.sweep(), 'nothing', 'the new host is present, so the next run does nothing');

-- Nobody else present: the longest-seated seat is the silent host itself, so nothing changes.
select tests.create_room(2, 'quick_match', 'FR', 'hn');
update public.room_members set joined_at = now() - interval '10 minutes' where id = tests.member_id('hn1');
update public.room_members set last_active_at = now() - interval '10 minutes' where room_id = tests.room_id();
select is(pg_temp.sweep(), 'nothing', 'with nobody else present the next-host rule picks the same seat: nothing');
select is((select m.role::text from public.room_members m where m.id = tests.member_id('hn1')), 'host',
          'and the host keeps the role');

-- ---------------------------------------------------------------------------------------------
-- 4. Dealing for over 20 seconds: the SQL baseline is dealt.
-- ---------------------------------------------------------------------------------------------
select tests.deal_game(2, 'dd', 'dealing');
update public.rooms set dealing_at = now() - interval '19 seconds' where id = tests.room_id();
select is(pg_temp.sweep(), 'nothing', 'dealing for 19 seconds: the host phone may still retry');
select is(pg_temp.state(), 'dealing', 'still dealing');

update public.rooms set dealing_at = now() - interval '21 seconds' where id = tests.room_id();
select is(pg_temp.sweep(), 'dealt', 'dealing for 21 seconds: the baseline is dealt');
select is(pg_temp.state(), 'swiping', 'and the room is swiping');
select cmp_ok((select count(*) from public.deck_entries where room_id = tests.room_id()), '>', 0::bigint,
              'each seat has cards');
select is(pg_temp.broadcast_count('state_changed', 'state', 'swiping'), 1::bigint, 'state_changed swiping is sent');

-- ---------------------------------------------------------------------------------------------
-- 5. Swiping past the time limit with a like and no vote since: the finale opens (reason time).
-- ---------------------------------------------------------------------------------------------
select pg_temp.game(3, 'tl');
select pg_temp.like_films(4);
select is(pg_temp.sweep(), 'nothing', 'a game inside its time limit is left alone');
update public.rooms set started_at = now() - interval '400 seconds' where id = tests.room_id();
select is(pg_temp.sweep(), 'finale', 'past the time limit the sweeper opens the finale');
select is(pg_temp.state(), 'finale', 'the room is in the finale');
select is((select r.finale_reason::text from public.rooms r where r.id = tests.room_id()), 'time', 'with reason time');
select is(pg_temp.broadcast_count('finale_started'), 1::bigint, 'finale_started is sent');

-- ---------------------------------------------------------------------------------------------
-- 6. Every present seat done: the finale with a like; with nothing liked, done with no pick at 5 min.
-- ---------------------------------------------------------------------------------------------
select pg_temp.game(2, 'ad');
select pg_temp.like_films(4);
update public.room_members set done_at = now() - interval '10 seconds' where room_id = tests.room_id();
select is(pg_temp.sweep(), 'finale', 'every present seat done with a like: the finale opens');
select is((select r.finale_reason::text from public.rooms r where r.id = tests.room_id()), 'all_done', 'with reason all_done');

select pg_temp.game(2, 'an');
update public.room_members set done_at = now() - interval '4 minutes 59 seconds' where room_id = tests.room_id();
select is(pg_temp.sweep(), 'nothing', 'everyone done and nothing liked: nothing at 4 min 59 s');
select is(pg_temp.state(), 'swiping', 'still swiping');
update public.room_members set done_at = now() - interval '5 minutes' where id = tests.member_id('an1');
update public.room_members set done_at = now() - interval '5 minutes' where id = tests.member_id('an2');
select is(pg_temp.sweep(), 'no_pick', 'at 5 minutes the night ends with no pick');
select is(pg_temp.state(), 'done', 'the room is done');
select is((select r.finale_reason::text from public.rooms r where r.id = tests.room_id()), 'all_done', 'with reason all_done');
select is((select count(*) from public.matches where room_id = tests.room_id()), 0::bigint, 'and no matches row');
select is(pg_temp.broadcast_count('state_changed', 'outcome', 'no_pick'), 1::bigint, 'state_changed carries outcome no_pick');

-- ---------------------------------------------------------------------------------------------
-- 7. Fewer than 2 seats heard from in the last 6 min 30: abandoned.
-- ---------------------------------------------------------------------------------------------
select pg_temp.game(3, 'fp');
update public.room_members set last_active_at = now() - interval '7 minutes'
where room_id = tests.room_id() and id <> tests.member_id('fp1');
select is(pg_temp.sweep(), 'abandoned', 'one seat heard from, the others silent for 7 minutes: abandoned');
select is(pg_temp.state(), 'abandoned', 'the room is abandoned');
select is(pg_temp.broadcast_count('state_changed', 'state', 'abandoned'), 1::bigint, 'state_changed abandoned is sent');
select isnt((select ended_at from public.rooms where id = tests.room_id()), null, 'an abandoned game has its end time (the closed screen shows it)');

select pg_temp.game(3, 'tp');
update public.room_members set last_active_at = now() - interval '7 minutes' where id = tests.member_id('tp3');
update public.room_members set last_active_at = now() - interval '6 minutes' where id = tests.member_id('tp2');
select is(pg_temp.sweep(), 'nothing', 'two seats heard from in the last 6 min 30: nothing');

-- A player who taps Leave waits the same five minutes as a dropped connection (decision of 4 Nov 2026).
select pg_temp.game(2, 'lv');
update public.room_members set left_at = now() - interval '4 minutes' where id = tests.member_id('lv2');
select is(pg_temp.sweep(), 'nothing', 'one of two players left 4 minutes ago: the room waits');
select is(pg_temp.state(), 'swiping', 'and is still swiping');
update public.room_members set left_at = now() - interval '5 minutes 1 second' where id = tests.member_id('lv2');
select is(pg_temp.sweep(), 'abandoned', 'left over 5 minutes ago: abandoned');
select isnt((select ended_at from public.rooms where id = tests.room_id()), null, 'with its end time');

-- A dropped connection: 90 seconds of presence plus five minutes.
select pg_temp.game(2, 'dc');
update public.room_members set last_active_at = now() - interval '6 minutes 29 seconds' where id = tests.member_id('dc2');
select is(pg_temp.sweep(), 'nothing', 'one of two silent for 6 min 29 s: the room waits');
update public.room_members set last_active_at = now() - interval '6 minutes 31 seconds' where id = tests.member_id('dc2');
select is(pg_temp.sweep(), 'abandoned', 'silent for 6 min 31 s: abandoned');

-- ---------------------------------------------------------------------------------------------
-- 8. The one-hour limit.
-- ---------------------------------------------------------------------------------------------
select pg_temp.game(2, 'hl');
select pg_temp.like_films(4);
update public.rooms set expires_at = now() - interval '1 second' where id = tests.room_id();
select is(pg_temp.sweep(), 'finale', 'past the one-hour limit while swiping with a like: the finale');
select is((select r.finale_reason::text from public.rooms r where r.id = tests.room_id()), 'time', 'with reason time');

select pg_temp.game(2, 'hq');
update public.rooms set expires_at = now() - interval '1 second' where id = tests.room_id();
select is(pg_temp.sweep(), 'abandoned', 'past the one-hour limit with nothing liked: abandoned');
select isnt((select ended_at from public.rooms where id = tests.room_id()), null, 'with its end time');

select pg_temp.finale(2, 'fo');
update public.rooms set expires_at = now() - interval '1 second' where id = tests.room_id();
update public.rounds set stage_closes_at = now() + interval '30 seconds' where id = pg_temp.round_id();
select is(pg_temp.sweep(), 'nothing', 'past the one-hour limit with a round still open: left to close at its deadline');
select is(pg_temp.state(), 'finale', 'a live round is never abandoned');

select pg_temp.finale(2, 'nr');
update public.rooms set expires_at = now() - interval '1 second' where id = tests.room_id();
delete from public.rounds where room_id = tests.room_id();
select is(pg_temp.sweep(), 'abandoned', 'a finale with no open round, past the limit: abandoned');

-- ---------------------------------------------------------------------------------------------
-- 9. A round no phone closed is closed two seconds after its end, with the M6.5 rules.
-- ---------------------------------------------------------------------------------------------
select pg_temp.finale(2, 'cr');
update public.rounds set stage_closes_at = now() - interval '1 second' where id = pg_temp.round_id();
select is(pg_temp.sweep(), 'nothing', 'a round 1 second past its deadline: the 2 second grace');
update public.rounds set stage_closes_at = now() - interval '3 seconds' where id = pg_temp.round_id();
select is(pg_temp.sweep(), 'closed_round', 'a round 3 seconds past its deadline is closed');
select is((select ro.stage::text from public.rounds ro where ro.id = pg_temp.round_id()), 'closed', 'the round is closed');
select is(pg_temp.state(), 'done', 'the room is done');
select is((select count(*) from public.matches where room_id = tests.room_id()), 1::bigint, 'with the pick');
select is(pg_temp.broadcast_count('match', 'decided', 'true'), 1::bigint, 'and match is sent');
select is(pg_temp.sweep(), 'nothing', 'a done room is left alone');

-- close_round_stage does nothing for a room that is no longer in the finale.
select pg_temp.finale(2, 'gd');
update public.rooms set state = 'abandoned', ended_at = now() where id = tests.room_id();
select is(internal.close_round_stage(pg_temp.round_id())->>'status', 'closed', 'closing a round of a room that left the finale answers closed');
select is(pg_temp.state(), 'abandoned', 'and does not bring the room back');
select is((select count(*) from public.matches where room_id = tests.room_id()), 0::bigint, 'nor write a pick');

-- ---------------------------------------------------------------------------------------------
-- 11. One action per room per run, in the spec's order.
-- ---------------------------------------------------------------------------------------------
select pg_temp.game(3, 'od');
select pg_temp.like_films(4);
update public.rooms set started_at = now() - interval '400 seconds' where id = tests.room_id();
update public.room_members set last_active_at = now() - interval '7 minutes'
where room_id = tests.room_id() and id <> tests.member_id('od1');
select is(pg_temp.sweep(), 'abandoned', 'short of players and past the time limit: abandoned, not sent to the finale');
select is(pg_temp.broadcast_count('finale_started'), 0::bigint, 'no vote was opened');

select pg_temp.finale(2, 'ox');
update public.rooms set expires_at = now() - interval '1 second' where id = tests.room_id();
update public.rounds set stage_closes_at = now() - interval '3 seconds' where id = pg_temp.round_id();
select is(pg_temp.sweep(), 'closed_round', 'an expired round is closed before the room is abandoned');
select is(pg_temp.state(), 'done', 'and the night has its pick');

-- ---------------------------------------------------------------------------------------------
-- 12. Done and abandoned rooms are never touched.
-- ---------------------------------------------------------------------------------------------
select pg_temp.game(2, 'dn');
update public.rooms set state = 'abandoned', ended_at = now() - interval '1 hour',
                        expires_at = now() - interval '5 hours' where id = tests.room_id();
select is(pg_temp.sweep(), 'nothing', 'an abandoned room is left alone');
update public.rooms set state = 'done' where id = tests.room_id();
select is(pg_temp.sweep(), 'nothing', 'a done room is left alone');
select is(internal.sweep_room(gen_random_uuid()), 'nothing', 'a room that does not exist is nothing');

-- ---------------------------------------------------------------------------------------------
-- 13. Access: nobody but the owner runs the sweeper.
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*) from (values ('internal.sweep_room(uuid)'), ('internal.abandon_room(uuid)'),
                                ('internal.sweep_rooms()')) f(sig)
   where has_function_privilege('anon', f.sig, 'execute') or has_function_privilege('authenticated', f.sig, 'execute')
      or has_function_privilege('public', f.sig, 'execute')),
  0::bigint, 'phones cannot run the sweeper');

select * from finish();
rollback;

-- M6.40: the solo game mode (game-modes.md#the-modes "Solo", solo-and-my-films.md section 4).
-- api.start_solo opens and starts a room with one seat in one call; nobody can join it or learn
-- it exists; no match check, shortlist or finale; api.solo_pick records the pick; the room ends
-- when the player leaves or after 30 minutes without a vote; the deal skips films answered in
-- earlier solo rooms. The catalog holds exactly 25 films, so a fresh player is dealt all of them.

begin;
select plan(107);

select tests.create_catalog(25);
-- The seed's films would always give the deal something: switch them off here.
update public.titles set is_active = false where original_title not like 'Catalog Film %';
select tests.use_deck_engine('sql');

create temp table solo_rooms (k text primary key, id uuid not null);
grant all on solo_rooms to public;

-- A player with a name, a country and the catalog's service.
create function pg_temp.player(p text) returns void language plpgsql as $$
begin
  perform tests.create_player(p);
  insert into public.profile_providers (profile_id, provider_id) values (tests.uid(p), 9001);
end $$;

-- As this player, start a solo room and remember it as p_key (default: the player's name).
create function pg_temp.solo(p text, p_settings jsonb default null, p_key text default null) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.start_solo(p_settings);
  perform tests.clear_authentication();
  if v->>'room_id' is not null then
    perform set_config('tests.room_id', v->>'room_id', true);
    insert into solo_rooms (k, id) values (coalesce(p_key, p), (v->>'room_id')::uuid)
    on conflict (k) do update set id = excluded.id;
  end if;
  return v;
end $$;

create function pg_temp.rid(p_key text) returns uuid language sql as $$
  select s.id from solo_rooms s where s.k = p_key
$$;

create function pg_temp.room_state(p_key text) returns text language sql as $$
  select r.state::text from public.rooms r where r.id = pg_temp.rid(p_key)
$$;

-- The player's next p_n cards (before they are answered).
create function pg_temp.next_films(p text, p_n integer) returns bigint[] language sql as $$
  select (tests.upcoming(p, tests.room_id()))[1:p_n]
$$;

-- As this player, answer their next p_n cards. Returns the last answer.
create function pg_temp.answer(p text, p_n integer, p_answer public.vote_answer default 'like') returns jsonb
language plpgsql as $$
declare
  v jsonb;
  t bigint;
  v_films bigint[] := pg_temp.next_films(p, p_n);
begin
  perform tests.authenticate_as(p);
  foreach t in array v_films loop
    v := api.cast_vote(tests.room_id(), t, p_answer);
  end loop;
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.events(p_key text, p_event text, p_state text default null) returns bigint
language sql as $$
  select count(*) from tests.broadcasts(pg_temp.rid(p_key), p_event) b
  where p_state is null or b->>'state' = p_state
$$;

create function pg_temp.pick(p text, p_title bigint) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.solo_pick(tests.room_id(), p_title);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.sweep() returns text language sql as $$ select internal.sweep_room(tests.room_id()) $$;

-- ---------------------------------------------------------------------------------------------
-- 0. The mode's row.
-- ---------------------------------------------------------------------------------------------
select is(
  (select gm.min_players || '/' || gm.max_players || '/' || gm.ends_on_first_match || '/' || gm.is_active
          || '/' || (gm.defaults->>'seen_rule')
   from public.game_modes gm where gm.slug = 'solo'),
  '1/1/false/false/hide_seen',
  'M6.40 the solo mode has one seat, no first-match end, hide_seen, and is not active for create_room');
select is((select count(*) from public.match_rules where mode = 'solo'), 0::bigint,
  'M6.40 the solo mode has no match rules, so a room has no card count and no time limit');

-- ---------------------------------------------------------------------------------------------
-- 1. One call opens and starts the room.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s1');
select is((select pg_temp.solo('s1'))->>'status', 'ok', 'M6.40 start_solo answers ok under the SQL deal');
select is(
  (select r.mode || '/' || r.state || '/' || r.max_players || '/' || r.seen_rule || '/' || r.service_rule
   from public.rooms r where r.id = pg_temp.rid('s1')),
  'solo/swiping/1/hide_seen/any_member',
  'M6.40 start_solo leaves one solo room swiping, hide_seen, any_member');
select is((select r.rule is null from public.rooms r where r.id = pg_temp.rid('s1')), true,
  'M6.40 a solo room freezes no rule (no card count, no time limit)');
select is(
  (select count(*) || '/' || min(m.role::text) || '/' || min(m.super_likes_left)
   from public.room_members m where m.room_id = pg_temp.rid('s1')),
  '1/host/32767',
  'M6.40 the room has one seat, the host, with no limit on super likes');
select is((select count(*) from public.deck_entries d where d.room_id = pg_temp.rid('s1')), 25::bigint,
  'M6.40 start_solo dealt the seat 25 cards');
select is((select r.code ~ '^[0-9]{6}$' from public.rooms r where r.id = pg_temp.rid('s1')), true,
  'M6.40 the room still draws a code');
select is((select (pg_temp.solo('s1', null, 'x'))->>'status'), 'ok', 'M6.40 positive control: a second start answers ok');
select is(pg_temp.events('s1', 'state_changed', 'swiping'), 1::bigint,
  'M6.40 the start broadcasts state_changed swiping');

-- 4. One solo session at a time: the first call's room ended as leave_room would.
select is(pg_temp.room_state('s1'), 'done', 'M6.40 starting again ends the caller''s other live solo room');
select is((select r.ended_at is not null from public.rooms r where r.id = pg_temp.rid('s1')), true,
  'M6.40 the ended room has ended_at');
select is(pg_temp.events('s1', 'state_changed', 'done'), 1::bigint, 'M6.40 the ended room broadcasts state_changed done');
select is(
  (select count(*) from public.rooms r join public.room_members m on m.room_id = r.id
   where r.mode = 'solo' and m.profile_id = tests.uid('s1') and r.state in ('lobby', 'dealing', 'swiping')),
  1::bigint,
  'M6.40 one live solo room per player');
select is(pg_temp.room_state('x'), 'swiping', 'M6.40 the new room swipes');

-- ---------------------------------------------------------------------------------------------
-- 2. Settings, name and country.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s2');
select is(pg_temp.solo('s2', '{"seen_rule": "allow_rewatch"}'), '{"status": "invalid_settings", "field": "seen_rule"}'::jsonb,
  'M6.40 a seen_rule other than hide_seen answers invalid_settings with the field');
select is(pg_temp.solo('s2', '{"seen_rule": "show_all"}')->>'field', 'seen_rule', 'M6.40 show_all is refused too');
select is(pg_temp.solo('s2', '{"quality": "gold"}')->>'field', 'quality',
  'M6.40 the settings are checked as create_room checks them');
select is(pg_temp.solo('s2', '{"seen_rule": "hide_seen", "reveal": "blind"}')->>'status', 'ok',
  'M6.40 hide_seen with another valid setting starts');
select is((select r.reveal::text from public.rooms r where r.id = pg_temp.rid('s2')), 'blind',
  'M6.40 the settings are kept on the room');

select tests.create_user('nameless');
select is((select pg_temp.solo('nameless'))->>'status', 'name_required', 'M6.40 no name answers name_required');
select tests.create_player('nocountry');
update public.profiles set country = null where id = tests.uid('nocountry');
select is((select pg_temp.solo('nocountry'))->>'status', 'country_required', 'M6.40 no country answers country_required');
select is(
  (select count(*) from public.room_members m where m.profile_id in (tests.uid('nameless'), tests.uid('nocountry'))),
  0::bigint,
  'M6.40 a refused start creates no room');

-- 3. create_room does not make a solo room.
select tests.authenticate_as('s2');
select is(api.create_room('solo')->>'status', 'unknown_mode', 'M6.40 create_room(solo) answers unknown_mode');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- 5. Nobody can join it or learn it exists.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s5');
select pg_temp.solo('s5');
select tests.create_player('j1');
select tests.create_player('j2');
create function pg_temp.code(p_key text) returns text language sql as $$
  select r.code::text from public.rooms r where r.id = pg_temp.rid(p_key)
$$;
create function pg_temp.join_as(p text, p_code text, p_ref uuid default null) returns text language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.join_room(p_code, p_ref);
  perform tests.clear_authentication();
  return v->>'status';
end $$;
select is(pg_temp.join_as('j1', pg_temp.code('s5')), 'not_found', 'M6.40 join_room answers not_found for a solo code');
select is(pg_temp.join_as('s5', pg_temp.code('s5')), 'not_found', 'M6.40 not even the player can join their own room by code');
select is(pg_temp.join_as('j1', pg_temp.code('s5'), pg_temp.rid('s5')), 'closed',
  'M6.40 a link to a solo room answers closed, as for a room that does not exist');
create temp table s5_info as select r.id, r.code::text as code from public.rooms r where r.id = pg_temp.rid('s5');
grant all on s5_info to public;
select tests.authenticate_as('j1');
select is(api.room_preview((select code from s5_info), (select id from s5_info))->>'status', 'closed',
  'M6.40 room_preview of a solo room answers as for a room that does not exist');
select is((select count(*) from api.rooms where id = (select id from s5_info)), 0::bigint, 'M6.40 another player reads no row of the room');
select is((select count(*) from api.room_seats where room_id = (select id from s5_info)), 0::bigint, 'M6.40 another player reads no seat of the room');
select tests.use_topic('room:' || (select id from s5_info));
select is((select count(*) from realtime.messages where topic = 'room:' || (select id from s5_info)), 0::bigint,
  'M6.40 another player reads nothing on the room topic');
select tests.clear_authentication();
select is((select count(*) from public.room_members where room_id = pg_temp.rid('s5')), 1::bigint,
  'M6.40 the room still has one seat after the attempts');
-- A failed attempt is counted like any not_found: the 6th attempt of one profile is limited.
select is(
  (select string_agg(pg_temp.join_as('j2', pg_temp.code('s5')), ',')
   from generate_series(1, 5)),
  'not_found,not_found,not_found,not_found,not_found',
  'M6.40 five attempts at a solo code answer not_found');
select is(pg_temp.join_as('j2', pg_temp.code('s5')), 'rate_limited', 'M6.40 the failed attempts at a solo code were counted');

-- ---------------------------------------------------------------------------------------------
-- 6. No match check, near miss, shortlist or finale.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s6');
select pg_temp.solo('s6');
select is(pg_temp.answer('s6', 25, 'like')->>'status', 'ok', 'M6.40 the 25th like of a solo player is accepted');
select is((select count(*) from public.room_cards where room_id = pg_temp.rid('s6') and state = 'matched'), 0::bigint,
  'M6.40 no card matches in a solo room');
select is((select count(*) from public.matches where room_id = pg_temp.rid('s6')), 0::bigint, 'M6.40 no matches row in a solo room');
select is((select count(*) from public.rounds where room_id = pg_temp.rid('s6')), 0::bigint, 'M6.40 no finale round in a solo room');
select is(pg_temp.events('s6', 'near_miss') + pg_temp.events('s6', 'match') + pg_temp.events('s6', 'finale_started'), 0::bigint,
  'M6.40 no near_miss, match or finale_started broadcast');
select is(pg_temp.room_state('s6'), 'swiping', 'M6.40 every card answered with likes does not open a finale');
select is((select m.done_at is not null from public.room_members m where m.room_id = pg_temp.rid('s6')), true,
  'M6.40 positive control: the seat is done (the everyone-done path ran)');
select is(internal.maybe_start_finale(pg_temp.rid('s6')), null::uuid, 'M6.40 maybe_start_finale returns null for a solo room');

-- 7. Super likes have no limit.
select pg_temp.player('s7');
select pg_temp.solo('s7');
select is(
  (select string_agg(a->>'status', ',') from (
     select pg_temp.answer('s7', 1, 'super_like') a union all
     select pg_temp.answer('s7', 1, 'super_like') union all
     select pg_temp.answer('s7', 1, 'super_like')) x),
  'ok,ok,ok', 'M6.40 three super likes in a row are accepted');
select is((select m.super_likes_left from public.room_members m where m.room_id = pg_temp.rid('s7')), 32764::smallint,
  'M6.40 each super like uses one of 32767');

-- ---------------------------------------------------------------------------------------------
-- 8. Leaving ends the room, with no pick.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s8');
select pg_temp.solo('s8');
select pg_temp.answer('s8', 2, 'like');
select tests.authenticate_as('s8');
select is(api.leave_room(tests.room_id())->>'status', 'ok', 'M6.40 leave_room answers ok');
select tests.clear_authentication();
select is(pg_temp.room_state('s8'), 'done', 'M6.40 leaving ends the solo room done');
select is((select r.ended_at is not null and r.decided_at is null from public.rooms r where r.id = pg_temp.rid('s8')), true,
  'M6.40 the ended room has ended_at and no decided_at');
select is((select count(*) from public.matches where room_id = pg_temp.rid('s8')), 0::bigint, 'M6.40 leaving records no pick');
select is(pg_temp.events('s8', 'state_changed', 'done'), 1::bigint, 'M6.40 leaving broadcasts state_changed done');
select is(pg_temp.events('s8', 'member_left'), 0::bigint, 'M6.40 leaving broadcasts no member_left');
select is(internal.write_room_stats(pg_temp.rid('s8'))->>'outcome', 'no_pick', 'M6.40 a room left without a pick has outcome no_pick');
select tests.authenticate_as('s8');
select is(api.leave_room(tests.room_id())->>'status', 'not_in_room', 'M6.40 leaving twice answers not_in_room');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- 9. The sweeper: 30 minutes without a vote.
-- ---------------------------------------------------------------------------------------------
-- The latest vote 31 minutes ago, the phone's heartbeat 10 seconds ago.
select pg_temp.player('s9');
select pg_temp.solo('s9');
select pg_temp.answer('s9', 2, 'like');
update public.swipe_log set created_at = now() - interval '31 minutes' where room_id = pg_temp.rid('s9');
update public.room_members set last_active_at = now() - interval '10 seconds' where room_id = pg_temp.rid('s9');
select is(pg_temp.sweep(), 'ended', 'M6.40 the sweeper ends a solo room 31 minutes after the latest vote, whatever the heartbeat');
select is(pg_temp.room_state('s9'), 'done', 'M6.40 the room is done');
select is((select r.ended_at is not null from public.rooms r where r.id = pg_temp.rid('s9')), true, 'M6.40 the ended room has ended_at');
select is(pg_temp.events('s9', 'state_changed', 'done'), 1::bigint, 'M6.40 the sweeper broadcasts state_changed done');
select is(internal.write_room_stats(pg_temp.rid('s9'))->>'outcome', 'no_pick', 'M6.40 the sweeper''s end has no pick');

-- 29 minutes: nothing.
select pg_temp.player('s10');
select pg_temp.solo('s10');
select pg_temp.answer('s10', 2, 'like');
update public.swipe_log set created_at = now() - interval '29 minutes' where room_id = pg_temp.rid('s10');
select is(pg_temp.sweep(), 'nothing', 'M6.40 29 minutes after the latest vote the room is left alone');
select is(pg_temp.room_state('s10'), 'swiping', 'M6.40 the room still swipes');

-- No vote at all: started_at counts.
select pg_temp.player('s11');
select pg_temp.solo('s11');
update public.rooms set started_at = now() - interval '29 minutes' where id = pg_temp.rid('s11');
select is(pg_temp.sweep(), 'nothing', 'M6.40 no vote and a start 29 minutes ago: nothing');
update public.rooms set started_at = now() - interval '31 minutes' where id = pg_temp.rid('s11');
select is(pg_temp.sweep(), 'ended', 'M6.40 no vote and a start 31 minutes ago: the room ends');
select is(pg_temp.room_state('s11'), 'done', 'M6.40 a room with no vote ends done');

-- An undo is the latest swipe: the old vote does not end the room.
select pg_temp.player('s12');
select pg_temp.solo('s12');
select pg_temp.answer('s12', 1, 'like');
update public.swipe_log set created_at = now() - interval '40 minutes' where room_id = pg_temp.rid('s12');
select tests.authenticate_as('s12');
select api.undo_last_vote(tests.room_id());
select tests.clear_authentication();
select is(pg_temp.sweep(), 'nothing', 'M6.40 an undo counts as activity for the 30 minutes');

-- 10. One player, past the hour and long silent, with likes: no finale, no abandon.
select pg_temp.player('s13');
select pg_temp.solo('s13');
select pg_temp.answer('s13', 3, 'like');
update public.rooms set expires_at = now() - interval '5 minutes' where id = pg_temp.rid('s13');
update public.room_members set last_active_at = now() - interval '20 minutes' where room_id = pg_temp.rid('s13');
select is(pg_temp.sweep(), 'nothing', 'M6.40 a lone solo player past expires_at with likes is not sent to a finale');
select is(pg_temp.room_state('s13'), 'swiping', 'M6.40 a solo room is never abandoned for fewer than two present or for the hour');
select is((select count(*) from public.rounds where room_id = pg_temp.rid('s13')), 0::bigint, 'M6.40 the sweeper opens no round');
-- The same with no like at all.
select pg_temp.player('s13b');
select pg_temp.solo('s13b');
update public.rooms set expires_at = now() - interval '5 minutes' where id = pg_temp.rid('s13b');
update public.room_members set last_active_at = now() - interval '20 minutes' where room_id = pg_temp.rid('s13b');
select is(pg_temp.sweep(), 'nothing', 'M6.40 nor is a solo room with no like abandoned at expires_at');

-- ---------------------------------------------------------------------------------------------
-- 11. The pick.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s14');
select pg_temp.solo('s14');
create temp table s14_films (n integer primary key, title_id bigint);
grant all on s14_films to public;
insert into s14_films select n, f from unnest(pg_temp.next_films('s14', 4)) with ordinality as x(f, n);
select tests.authenticate_as('s14');
select api.cast_vote(tests.room_id(), (select title_id from s14_films where n = 1), 'like');
select api.cast_vote(tests.room_id(), (select title_id from s14_films where n = 2), 'nope');
select api.cast_vote(tests.room_id(), (select title_id from s14_films where n = 3), 'super_like');
select tests.clear_authentication();

select is(pg_temp.pick('s14', (select title_id from s14_films where n = 2))->>'status', 'not_liked', 'M6.40 a noped film answers not_liked');
select is(pg_temp.pick('s14', (select title_id from s14_films where n = 4))->>'status', 'not_liked', 'M6.40 a film not answered yet answers not_liked');
select is(pg_temp.room_state('s14'), 'swiping', 'M6.40 a refused pick leaves the room swiping');
select is(pg_temp.pick('s14', (select title_id from s14_films where n = 1)),
  jsonb_build_object('status', 'ok', 'title_id', (select title_id from s14_films where n = 1)),
  'M6.40 a liked film is picked');
select is(pg_temp.room_state('s14'), 'done', 'M6.40 the pick ends the room done');
select is((select r.decided_at is not null and r.ended_at is not null from public.rooms r where r.id = pg_temp.rid('s14')), true,
  'M6.40 the picked room has decided_at and ended_at');
select is(
  (select m.kind || '/' || m.like_count || '/' || m.present_count || '/' || m.pick_order || '/' || (m.matched_at is null)
          || '/' || (m.title_id = (select title_id from s14_films where n = 1))
   from public.matches m where m.room_id = pg_temp.rid('s14')),
  'unanimous/1/1/1/true/true',
  'M6.40 the pick is a unanimous match row, pick_order 1, no matched_at');
select is((select count(*) from public.matches where room_id = pg_temp.rid('s14')), 1::bigint, 'M6.40 one pick row');
select is((select c.state::text from public.room_cards c where c.room_id = pg_temp.rid('s14')
           and c.title_id = (select title_id from s14_films where n = 1)), 'matched', 'M6.40 the picked card is matched');
select is(pg_temp.events('s14', 'state_changed', 'done'), 1::bigint, 'M6.40 the pick broadcasts state_changed done');
select is(pg_temp.events('s14', 'match'), 0::bigint, 'M6.40 the pick broadcasts no match event');
select is(internal.write_room_stats(pg_temp.rid('s14'))->>'outcome', 'match', 'M6.40 a picked solo room has outcome match');
select is(pg_temp.pick('s14', (select title_id from s14_films where n = 1))->>'status', 'ok', 'M6.40 a retry for the same film answers ok');
select is(pg_temp.pick('s14', (select title_id from s14_films where n = 3)), '{"status": "closed", "state": "done"}'::jsonb,
  'M6.40 a second film after the pick answers closed');
select is((select count(*) from public.matches where room_id = pg_temp.rid('s14')), 1::bigint, 'M6.40 the retry added no row');

-- A super liked film can be picked; a like that was undone cannot.
select pg_temp.player('s15');
select pg_temp.solo('s15');
create temp table s15_films (n integer primary key, title_id bigint);
grant all on s15_films to public;
insert into s15_films select n, f from unnest(pg_temp.next_films('s15', 3)) with ordinality as x(f, n);
select tests.authenticate_as('s15');
select api.cast_vote(tests.room_id(), (select title_id from s15_films where n = 1), 'like');
select api.undo_last_vote(tests.room_id());
select api.cast_vote(tests.room_id(), (select title_id from s15_films where n = 2), 'super_like');
select tests.clear_authentication();
select is(pg_temp.pick('s15', (select title_id from s15_films where n = 1))->>'status', 'not_liked', 'M6.40 a like that was undone answers not_liked');
select is(pg_temp.pick('s15', (select title_id from s15_films where n = 2))->>'status', 'ok', 'M6.40 a super liked film can be picked');

-- Access: another profile, and a group room.
select pg_temp.player('s16');
select pg_temp.solo('s16');
select pg_temp.answer('s16', 1, 'like');
select tests.create_player('intruder');
select throws_ok(
  $$select pg_temp.pick('intruder', (select title_id from public.votes v
      join public.room_members m on m.id = v.room_member_id where m.room_id = tests.room_id() limit 1))$$,
  '42501', null, 'M6.40 solo_pick by a profile with no seat in the room raises 42501');
select tests.create_room(2, 'quick_match', 'FR', 'gr');
select throws_ok($$select pg_temp.pick('gr1', tests.film(1))$$, '22023', null,
  'M6.40 solo_pick on a group room raises 22023');
select throws_ok($$select pg_temp.pick('gr1', tests.film(1)) from (select tests.authenticate_as_anon()) x$$, null, null,
  'M6.40 solo_pick as anon raises');

-- ---------------------------------------------------------------------------------------------
-- 13. The deal skips films answered in earlier solo rooms; group rooms are unchanged.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s17');
select pg_temp.solo('s17', null, 's17a');
create temp table s17_films (title_id bigint);
insert into s17_films select unnest(pg_temp.next_films('s17', 5));
select pg_temp.answer('s17', 1, 'like');
select pg_temp.answer('s17', 1, 'nope');
select pg_temp.answer('s17', 1, 'super_like');
select pg_temp.answer('s17', 1, 'nope');
select pg_temp.answer('s17', 1, 'like');
-- One undone vote leaves no vote behind, so that film may come back.
select tests.authenticate_as('s17');
select api.undo_last_vote(tests.room_id());
select tests.clear_authentication();
select is((select count(*) from public.votes v join public.room_members m on m.id = v.room_member_id
           where m.room_id = pg_temp.rid('s17a')), 4::bigint, 'M6.40 positive control: four votes remain in the first room');
select is(pg_temp.solo('s17', null, 's17b')->>'status', 'ok', 'M6.40 the second solo room starts');
select is(
  (select count(*) from public.room_cards c
   where c.room_id = pg_temp.rid('s17b')
     and c.title_id in (select v.title_id from public.votes v join public.room_members m on m.id = v.room_member_id
                        where m.room_id = pg_temp.rid('s17a'))),
  0::bigint, 'M6.40 no film answered in the earlier solo room is dealt again, whatever the answer');
select is((select count(*) from public.room_cards c where c.room_id = pg_temp.rid('s17b')), 21::bigint,
  'M6.40 the other films, the undone one included, are dealt');

-- The same player in a group room can be dealt all of them.
select tests.create_player('g17');
select tests.authenticate_as('s17');
create temp table g17_room (id uuid, code text);
grant all on g17_room to public;
select tests.clear_authentication();
create function pg_temp.group_room() returns void language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as('s17');
  v := api.create_room('quick_match');
  perform tests.authenticate_as('g17');
  perform api.join_room(v->>'code');
  perform tests.clear_authentication();
  insert into g17_room values ((v->>'room_id')::uuid, v->>'code');
end $$;
select pg_temp.group_room();
select is(
  (select count(*) from internal.deck_candidates((select id from g17_room)) c
   where c.title_id in (select v.title_id from public.votes v join public.room_members m on m.id = v.room_member_id
                        where m.room_id = pg_temp.rid('s17a'))),
  4::bigint, 'M6.40 a group room can still be dealt films the player answered in solo');

-- ---------------------------------------------------------------------------------------------
-- 14. Too few films: the new room ends abandoned.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s18');
select pg_temp.solo('s18', null, 's18a');
select pg_temp.answer('s18', 6, 'nope');
select is(pg_temp.solo('s18', null, 's18b'), '{"status": "too_few_films", "eligible": 19}'::jsonb,
  'M6.40 fewer than 20 films answers too_few_films with the count');
create temp table s18_refused as
  select r.id from public.rooms r join public.room_members m on m.room_id = r.id
  where r.mode = 'solo' and m.profile_id = tests.uid('s18') and r.id <> pg_temp.rid('s18a');
select is((select r.state::text from public.rooms r where r.id = (select id from s18_refused)), 'abandoned',
  'M6.40 the room of a refused start is abandoned, not back in the lobby');
select is((select count(*) from tests.broadcasts((select id from s18_refused), 'state_changed') b where b->>'state' = 'abandoned'),
  1::bigint, 'M6.40 it broadcasts state_changed abandoned');
select is(pg_temp.room_state('s18a'), 'done', 'M6.40 the earlier solo room was ended by the start');
select is(
  (select count(*) from public.rooms r join public.room_members m on m.room_id = r.id
   where r.mode = 'solo' and m.profile_id = tests.uid('s18') and r.state in ('lobby', 'dealing', 'swiping')),
  0::bigint, 'M6.40 the player has no live solo room left');

-- ---------------------------------------------------------------------------------------------
-- Under the server's deck engine the start answers dealing.
-- ---------------------------------------------------------------------------------------------
select tests.use_deck_engine('server');
select pg_temp.player('s19');
select is(
  (select pg_temp.solo('s19') - 'room_id' - 'member_id'), '{"status": "dealing"}'::jsonb,
  'M6.40 under the server engine start_solo answers dealing');
select is(pg_temp.room_state('s19'), 'dealing', 'M6.40 the room waits for the deal');
select is((select count(*) from tests.queued('deck_requests') q where q->>'room_id' = pg_temp.rid('s19')::text and q->>'kind' = 'start'),
  1::bigint, 'M6.40 the start is queued for the deck worker');
select tests.use_deck_engine('sql');

-- ---------------------------------------------------------------------------------------------
-- 15. Limits: 20 calls per 10 minutes per profile.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('s20');
select is(
  (select count(*) from generate_series(1, 20) n
   where pg_temp.solo('s20', '{"seen_rule": "show_all"}')->>'status' = 'invalid_settings'),
  20::bigint, 'M6.40 twenty calls in ten minutes are answered');
select is(pg_temp.solo('s20')->>'status', 'rate_limited', 'M6.40 the 21st call answers rate_limited');
select is((select count(*) from public.room_members where profile_id = tests.uid('s20')), 0::bigint, 'M6.40 a limited call creates no room');

-- ---------------------------------------------------------------------------------------------
-- 16. Access.
-- ---------------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.start_solo(jsonb)', 'execute'), false, 'M6.40 anon cannot execute start_solo');
select is(has_function_privilege('anon', 'api.solo_pick(uuid, bigint)', 'execute'), false, 'M6.40 anon cannot execute solo_pick');
select is(has_function_privilege('authenticated', 'api.start_solo(jsonb)', 'execute'), true, 'M6.40 authenticated can execute start_solo');
select is(has_function_privilege('authenticated', 'api.solo_pick(uuid, bigint)', 'execute'), true, 'M6.40 authenticated can execute solo_pick');

select * from finish();
rollback;

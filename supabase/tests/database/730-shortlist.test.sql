-- M6.34: matches build a shortlist (three-matches-and-fair-finalists.md#decided,
-- game-modes.md#when-its-a-match, #changes-to-the-data-model). A whole-room match joins the shortlist
-- and swiping goes on; the match that fills it (matches_to_end, 3 at launch) starts the finale.

begin;
select plan(61);

select tests.create_catalog(40);
select tests.use_deck_engine('sql');

create function pg_temp.state() returns text language sql as $$
  select r.state::text from public.rooms r where r.id = tests.room_id()
$$;

create function pg_temp.count_of(p_event text) returns bigint language sql as $$
  select count(*) from tests.broadcasts(tests.room_id(), p_event)
$$;

create function pg_temp.matches() returns bigint language sql as $$
  select count(*) from public.matches where room_id = tests.room_id() and matched_at is not null
$$;

create function pg_temp.card(p_film integer) returns text language sql as $$
  select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(p_film)
$$;

create function pg_temp.joined() returns text language sql as $$
  select string_agg(mt.title_id::text, ',' order by mt.title_id)
  from public.matches mt where mt.room_id = tests.room_id() and mt.matched_at is not null
$$;

create function pg_temp.films(p_a integer, p_b integer, p_c integer) returns text language sql as $$
  select string_agg(x::text, ',' order by x) from unnest(array[tests.film(p_a), tests.film(p_b), tests.film(p_c)]) x
$$;

create function pg_temp.reason() returns text language sql as $$
  select r.finale_reason::text from public.rooms r where r.id = tests.room_id()
$$;

-- A swiping game, seats seated well before the start.
create function pg_temp.game(p_players integer, p_prefix text, p_mode text default 'quick_match') returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping', p_mode);
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds', expires_at = now() + interval '50 minutes'
  where id = tests.room_id();
end
$$;

-- Every seat of the prefix likes the film; returns the last seat's answer.
create function pg_temp.all_like(p_prefix text, p_players integer, p_film integer) returns jsonb language plpgsql as $$
declare
  v_answer jsonb;
begin
  for i in 1..p_players loop
    v_answer := tests.vote(p_prefix || i, p_film, 'like');
  end loop;
  return v_answer;
end
$$;

create function pg_temp.silent(p_name text, p_interval interval) returns void language sql as $$
  update public.room_members set last_active_at = now() - p_interval where id = tests.member_id(p_name)
$$;

create function pg_temp.leave(p_name text) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_name);
  perform api.leave_room(tests.room_id());
  perform tests.clear_authentication();
end
$$;

-- One match (film 1), then films 2, 3 and 4 liked by every seat but the fourth; film 3 has a super
-- like, so it ranks first in the re-check order, then film 2, then film 4.
create function pg_temp.setup_rank(p_prefix text) returns void language plpgsql as $$
begin
  perform pg_temp.game(4, p_prefix);
  perform pg_temp.all_like(p_prefix, 4, 1);
  perform tests.vote(p_prefix || '1', 2, 'like'); perform tests.vote(p_prefix || '2', 2, 'like'); perform tests.vote(p_prefix || '3', 2, 'like');
  perform tests.vote(p_prefix || '1', 3, 'super_like'); perform tests.vote(p_prefix || '2', 3, 'like'); perform tests.vote(p_prefix || '3', 3, 'like');
  perform tests.vote(p_prefix || '1', 4, 'like'); perform tests.vote(p_prefix || '2', 4, 'like'); perform tests.vote(p_prefix || '3', 4, 'like');
end
$$;

-- 1. The seed.
select is(
  (select string_agg(gm.slug || ' ' || (gm.defaults->>'matches_to_end') || ' ' || gm.ends_on_first_match, ', ' order by gm.sort)
   from public.game_modes gm),
  'quick_match 3 false, final_cut 3 false, date_night 3 false',
  'M6.34 each launch mode has matches_to_end 3 and ends_on_first_match false'
);
select tests.create_player('viewer');
select tests.authenticate_as('viewer');
select is(
  (select string_agg(g.slug || ' ' || g.matches_to_end, ', ' order by g.sort) from api.game_modes g),
  'quick_match 3, final_cut 3, date_night 3',
  'M6.34 api.game_modes returns matches_to_end 3 for each mode'
);
select tests.clear_authentication();

-- 2. A missing value reads as 3.
update public.game_modes set defaults = defaults - 'matches_to_end' where slug = 'quick_match';
select is((select g.matches_to_end from api.game_modes g where g.slug = 'quick_match'), 3,
  'M6.34 api.game_modes reads a missing matches_to_end as 3');
select pg_temp.game(3, 'm');
select pg_temp.all_like('m', 3, 1);
select pg_temp.all_like('m', 3, 2);
select is(pg_temp.state(), 'swiping', 'M6.34 positive control: two matches with the key missing still swipe');
select pg_temp.all_like('m', 3, 3);
select is(pg_temp.state(), 'finale', 'M6.34 with matches_to_end missing, the third match starts the finale');
update public.game_modes set defaults = defaults || '{"matches_to_end": 3}' where slug = 'quick_match';

-- 3. The first match of Quick Match with 3 players.
select pg_temp.game(3, 'a');
create temp table first_vote as select pg_temp.all_like('a', 3, 1) as a;
select is(pg_temp.state(), 'swiping', 'M6.34 the first match leaves the room swiping');
select is(pg_temp.card(1), 'matched', 'M6.34 the matched card is matched');
select is(pg_temp.matches(), 1::bigint, 'M6.34 one matches row with matched_at');
select is(
  (select m->>'decided' || '/' || (m->>'shortlisted') || '/' || (m->>'shortlist_size') || '/' || (m->>'likes') || '/' || (m->>'of')
   from tests.broadcasts(tests.room_id(), 'match') m),
  'false/1/3/3/3',
  'M6.34 the match payload says decided false, 1 of 3 shortlisted, 3 likes of 3'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s->>'state' in ('finale', 'done')),
  0::bigint,
  'M6.34 no state_changed to finale or done is sent'
);
select is(
  (select a->>'match' || '/' || (a->>'decided') || '/' || (a ? 'state')::text from first_vote),
  'true/false/false',
  'M6.34 the vote answers match true, decided false, and no state'
);

-- 4. The second match.
select pg_temp.all_like('a', 3, 2);
select is(
  (select m->>'shortlisted' from tests.broadcasts(tests.room_id(), 'match') m where m->>'title_id' = tests.film(2)::text),
  '2',
  'M6.34 the second match says shortlisted 2'
);
select is(pg_temp.state(), 'swiping', 'M6.34 two matches, the room is still swiping');

-- 5. The third match fills the shortlist.
create temp table third_vote as select pg_temp.all_like('a', 3, 3) as a;
select is(
  (select m->>'shortlisted' || '/' || (m->>'decided') from tests.broadcasts(tests.room_id(), 'match') m where m->>'title_id' = tests.film(3)::text),
  '3/false',
  'M6.34 the third match is sent with shortlisted 3, not decided'
);
select is(pg_temp.state(), 'finale', 'M6.34 the third match starts the finale');
select is(pg_temp.reason(), 'shortlist_full', 'M6.34 the finale reason is shortlist_full');
select is(pg_temp.count_of('finale_started'), 1::bigint, 'M6.34 finale_started is sent');
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s->>'state' = 'finale'),
  1::bigint,
  'M6.34 state_changed finale is sent'
);
select is(
  (select a->>'match' || '/' || (a->>'decided') || '/' || (a->>'state') from third_vote),
  'true/false/finale',
  'M6.34 the filling vote answers match true, decided false, state finale'
);
select ok(
  (select m.inserted_at <= f.inserted_at
   from realtime.messages m, realtime.messages f
   where m.topic = 'room:' || tests.room_id()::text and m.event = 'match' and m.payload->>'title_id' = tests.film(3)::text
     and f.topic = m.topic and f.event = 'finale_started'),
  'M6.34 the filling match is sent before finale_started'
);

-- 6. Date Night (2 players) and Final Cut.
select pg_temp.game(2, 'd', 'date_night');
select pg_temp.all_like('d', 2, 1);
select pg_temp.all_like('d', 2, 2);
select is(pg_temp.state(), 'swiping', 'M6.34 Date Night: two matches, still swiping');
select pg_temp.all_like('d', 2, 3);
select is(pg_temp.state() || '/' || pg_temp.reason(), 'finale/shortlist_full', 'M6.34 Date Night: the third match starts the finale');
select pg_temp.game(3, 'f', 'final_cut');
select pg_temp.all_like('f', 3, 1);
select pg_temp.all_like('f', 3, 2);
select is(pg_temp.state(), 'swiping', 'M6.34 Final Cut: two matches, still swiping');
select pg_temp.all_like('f', 3, 3);
select is(pg_temp.state() || '/' || pg_temp.reason(), 'finale/shortlist_full', 'M6.34 Final Cut: the third match starts the finale');

-- 7. Party and Blind send the same match payload.
select pg_temp.game(3, 'p');
update public.rooms set reveal = 'party' where id = tests.room_id();
select pg_temp.all_like('p', 3, 1);
create temp table party_match as select m - 'id' as m from tests.broadcasts(tests.room_id(), 'match') m;
select pg_temp.game(3, 'b');
update public.rooms set reveal = 'blind' where id = tests.room_id();
select pg_temp.all_like('b', 3, 1);
select is(
  (select m - 'id' from tests.broadcasts(tests.room_id(), 'match') m),
  (select m from party_match),
  'M6.34 Blind sends the same match payload as Party'
);
select is(pg_temp.state(), 'swiping', 'M6.34 a Blind match joins the shortlist too');

-- 8. matches_to_end 1 keeps the instant pick.
update public.game_modes set defaults = defaults || '{"matches_to_end": 1}' where slug = 'quick_match';
select pg_temp.game(3, 'o');
create temp table one_vote as select pg_temp.all_like('o', 3, 1) as a;
select is(
  (select mt.pick_order::text || '/' || mt.kind::text from public.matches mt where mt.room_id = tests.room_id()),
  '1/unanimous',
  'M6.34 matches_to_end 1: the match is the pick (pick_order 1)'
);
select is(
  pg_temp.state() || '/' || (select (r.decided_at is not null and r.ended_at is not null)::text from public.rooms r where r.id = tests.room_id()),
  'done/true',
  'M6.34 matches_to_end 1: the room is done with decided_at and ended_at'
);
select is(
  (select m->>'decided' || '/' || (m->>'shortlisted') || '/' || (m->>'shortlist_size') from tests.broadcasts(tests.room_id(), 'match') m),
  'true/1/1',
  'M6.34 matches_to_end 1: the match says decided true, shortlisted 1 of 1'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s->>'state' = 'done'),
  1::bigint,
  'M6.34 matches_to_end 1: state_changed done follows'
);
select is((select a->>'decided' from one_vote), 'true', 'M6.34 matches_to_end 1: the vote answers decided true');
update public.game_modes set defaults = defaults || '{"matches_to_end": 3}' where slug = 'quick_match';

-- 9. Several matches at once, through a leave, a removal and the sweeper's silence re-check.
select pg_temp.setup_rank('r');
select is(pg_temp.matches(), 1::bigint, 'M6.34 positive control: one match, three films one like short');
select pg_temp.leave('r4');
select is(pg_temp.joined(), pg_temp.films(1, 3, 2), 'M6.34 a leave: the first two films in the re-check order join (3, then 2)');
select is(pg_temp.state() || '/' || pg_temp.reason(), 'finale/shortlist_full', 'M6.34 a leave: the shortlist fills and the finale starts');
select is(pg_temp.card(4), 'active', 'M6.34 a leave: the third film stays active');
select is(
  (select count(*) from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(4)),
  0::bigint,
  'M6.34 a leave: the third film has no matches row'
);

select pg_temp.setup_rank('s');
select tests.authenticate_as('s1');
select is(api.remove_member(tests.room_id(), tests.member_id('s4'))->>'status', 'ok', 'M6.34 the host removes the seat');
select tests.clear_authentication();
select is(pg_temp.joined(), pg_temp.films(1, 3, 2), 'M6.34 a removal: the same two films join');
select is(pg_temp.state() || '/' || pg_temp.card(4), 'finale/active', 'M6.34 a removal: the finale starts and the third film stays active');

select pg_temp.setup_rank('t');
select pg_temp.silent('t4', interval '3 minutes 1 second');
select is(internal.sweep_room(tests.room_id()), 'rechecked', 'M6.34 the sweeper re-checks after the silence');
select is(pg_temp.joined(), pg_temp.films(1, 3, 2), 'M6.34 the sweeper: the same two films join');
select is(pg_temp.state() || '/' || pg_temp.card(4), 'finale/active', 'M6.34 the sweeper: the finale starts and the third film stays active');

-- 11. Outside swiping, nothing matches.
select pg_temp.game(3, 'x');
select tests.vote('x1', 5, 'like');
select tests.vote('x2', 5, 'like');
update public.room_members set left_at = now() where id = tests.member_id('x3');
update public.rooms set state = 'finale' where id = tests.room_id();
select is(internal.check_card_match(tests.room_id(), tests.film(5)), null::jsonb, 'M6.34 in the finale, check_card_match answers null');
select is(pg_temp.matches(), 0::bigint, 'M6.34 in the finale, no match is inserted');
select lives_ok(
  format('select internal.recheck_room_matches(%L)', tests.room_id()),
  'M6.34 in the finale, the re-check does nothing'
);
select is(pg_temp.matches(), 0::bigint, 'M6.34 in the finale, the re-check inserts nothing');

-- 12. 5 players, 70%: a shortlisted film's late like is only a vote.
select pg_temp.game(5, 'n');
select tests.vote('n1', 1, 'like'); select tests.vote('n2', 1, 'like'); select tests.vote('n3', 1, 'like');
select tests.vote('n4', 1, 'like');
select is(pg_temp.card(1), 'matched', 'M6.34 positive control: 4 of 5 likes match under the 70% rule');
create temp table late_vote as select tests.vote('n5', 1, 'like') as a;
select is((select a->>'status' || '/' || (a->>'match') from late_vote), 'ok/false', 'M6.34 the fifth like on a shortlisted film answers ok, match false');
select is(pg_temp.matches(), 1::bigint, 'M6.34 no second matches row follows');
select is(pg_temp.count_of('match'), 1::bigint, 'M6.34 no second match event follows');
select is(pg_temp.count_of('near_miss'), 0::bigint, 'M6.34 no near_miss follows');

-- 13. A card that matched can't be undone.
select pg_temp.game(3, 'u');
select pg_temp.all_like('u', 3, 1);
select tests.authenticate_as('u3');
select is(api.undo_last_vote(tests.room_id())->>'status', 'locked', 'M6.34 the like that completed a match answers locked on undo');
select tests.clear_authentication();
select is(
  (select count(*) from public.votes v where v.room_id = tests.room_id() and v.title_id = tests.film(1)),
  3::bigint,
  'M6.34 the vote stays after the refused undo'
);

-- 14. rooms.stats.matches counts matched_at, not kinds.
select pg_temp.game(2, 'z');
update public.rooms set state = 'done', ended_at = now() where id = tests.room_id();
select is((internal.write_room_stats(tests.room_id())->>'matches')::int, 0, 'M6.34 stats.matches is 0 for a room with no pick');

update public.game_modes set defaults = defaults || '{"matches_to_end": 1}' where slug = 'quick_match';
select pg_temp.game(2, 'y');
select pg_temp.all_like('y', 2, 1);
select is((internal.write_room_stats(tests.room_id())->>'matches')::int, 1, 'M6.34 stats.matches is 1 for a matches_to_end 1 pick');
update public.game_modes set defaults = defaults || '{"matches_to_end": 3}' where slug = 'quick_match';

select pg_temp.game(2, 'w');
select pg_temp.all_like('w', 2, 1);
select pg_temp.all_like('w', 2, 2);
select pg_temp.all_like('w', 2, 3);
update public.matches set kind = 'finale', pick_order = 1 where room_id = tests.room_id() and title_id = tests.film(2);
update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = tests.room_id();
select is((internal.write_room_stats(tests.room_id())->>'matches')::int, 3,
  'M6.34 stats.matches is 3 after a shortlist_full round, the winner turned finale included');

select pg_temp.game(2, 'v');
insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
values (tests.room_id(), tests.film(4), 'finale', 1, 2, 1);
update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = tests.room_id();
select is((internal.write_room_stats(tests.room_id())->>'matches')::int, 0,
  'M6.34 stats.matches is 0 for a finale from swipes whose winner was never a match');

select * from finish();
rollback;

-- M6.5: the whole ballot in one call, the close, and the counting and tie rules
-- (game-modes.md#functions-still-to-write, #counting). Vetoes are secret until the round closes.

begin;
select plan(86);

select tests.create_catalog(40);
select tests.create_player('outsider');

-- A finale round: a swiping game whose first seat liked films 1 to 4, then a time-limit vote opens
-- it (3 players: 4 finalists, a final_cut round). The seats are the prefix plus 1, 2, 3.
create function pg_temp.finale(p_players integer, p_prefix text) returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping');
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  for i in 1..4 loop
    perform tests.vote(p_prefix || '1', i, 'like');
  end loop;
  update public.rooms set started_at = now() - interval '400 seconds' where id = tests.room_id();
  perform tests.vote(p_prefix || '1', 25, 'nope');
  if (select r.state::text from public.rooms r where r.id = tests.room_id()) <> 'finale' then
    raise exception 'pg_temp.finale: the finale did not open';
  end if;
end
$$;

create function pg_temp.rid() returns uuid language sql as $$
  select ro.id from public.rounds ro where ro.room_id = tests.room_id() order by ro.seq desc limit 1
$$;

-- The film at a seed of the room's round.
create function pg_temp.t(p_seed integer) returns bigint language sql as $$
  select rc.title_id from public.round_candidates rc where rc.round_id = pg_temp.rid() and rc.seed = p_seed
$$;

-- Keeps only the first p_keep finalists.
create function pg_temp.keep(p_keep integer) returns void language sql as $$
  delete from public.round_candidates where round_id = pg_temp.rid() and seed > p_keep
$$;

-- As the seat, api.cast_ballot with the order given as seeds.
create function pg_temp.ballot(p_name text, p_order integer[], p_veto integer default null) returns jsonb
language plpgsql as $$
declare
  v_round uuid := pg_temp.rid();
  v_films bigint[];
  v_veto bigint := case when p_veto is null then null else pg_temp.t(p_veto) end;
  v_answer jsonb;
begin
  select array_agg(pg_temp.t(x.s) order by x.o) into v_films from unnest(p_order) with ordinality x(s, o);
  perform tests.authenticate_as(p_name);
  v_answer := api.cast_ballot(v_round, v_films, v_veto);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

-- The same with the films given as ids.
create function pg_temp.raw(p_name text, p_films bigint[], p_veto bigint default null) returns jsonb
language plpgsql as $$
declare
  v_round uuid := pg_temp.rid();
  v_answer jsonb;
begin
  perform tests.authenticate_as(p_name);
  v_answer := api.cast_ballot(v_round, p_films, p_veto);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

-- Remembers the round for a test that runs as a player (pg_temp functions are not open to them).
create function pg_temp.mark() returns text language sql as $$ select set_config('t.r', pg_temp.rid()::text, true) $$;

create function pg_temp.close_as(p_name text) returns jsonb language plpgsql as $$
declare
  v_round uuid := pg_temp.rid();
  v_answer jsonb;
begin
  perform tests.authenticate_as(p_name);
  v_answer := api.close_round_stage(v_round);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

-- Puts the deadline p_secs seconds in the past (negative: in the future).
create function pg_temp.past(p_secs integer) returns void language sql as $$
  update public.rounds set stage_closes_at = now() - make_interval(secs => p_secs) where id = pg_temp.rid()
$$;

create function pg_temp.winner_seed() returns integer language sql as $$
  select rc.seed::integer from public.round_candidates rc
  join public.rounds ro on ro.id = rc.round_id and ro.winner_title_id = rc.title_id
  where ro.id = pg_temp.rid()
$$;

create function pg_temp.pts() returns text language sql as $$
  select string_agg(rc.points::text, '/' order by rc.seed) from public.round_candidates rc where rc.round_id = pg_temp.rid()
$$;

-- The seeds of the knocked-out films.
create function pg_temp.out() returns text language sql as $$
  select coalesce(string_agg(rc.seed::text, ',' order by rc.seed) filter (where rc.vetoed_at is not null), '')
  from public.round_candidates rc where rc.round_id = pg_temp.rid()
$$;

create function pg_temp.reason() returns text language sql as $$
  select (select p from tests.broadcasts(tests.room_id(), 'match') p limit 1)->>'reason'
$$;

-- 1. A full ballot answers ok, writes the rows and tells the room who locked in, never what.
select pg_temp.finale(3, 'a');
create temp table v_a1 as select pg_temp.ballot('a1', array[1, 2, 3, 4]) as a;
select is(
  (select a->>'status' || '/' || jsonb_array_length(a->'locked') || '/' || (a->>'of') from v_a1),
  'ok/1/3',
  'M6.5 a full ballot answers ok with the seats locked in and the seats present'
);
select is(
  (select count(*) from public.round_ballots b where b.round_id = pg_temp.rid() and b.kind = 'rank'),
  4::bigint,
  'M6.5 a ballot writes one rank row per film'
);
select is(
  (select bool_and(b.rank = c.seed)::text from public.round_ballots b
   join public.round_candidates c on c.round_id = b.round_id and c.title_id = b.title_id
   where b.round_id = pg_temp.rid() and b.kind = 'rank'),
  'true',
  'M6.5 rank 1 is the first film of the order'
);
select is(
  (select count(*) from public.round_ballots b where b.round_id = pg_temp.rid() and b.kind = 'pass' and b.title_id is null),
  1::bigint,
  'M6.5 a ballot without a veto writes one pass row'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'round_progress')),
  1::bigint,
  'M6.5 a ballot sends round_progress'
);
select is(
  (select array_to_string(array(select k from jsonb_object_keys(p) k where k <> 'id' order by k), ',') from tests.broadcasts(tests.room_id(), 'round_progress') p limit 1),
  'locked,of,round_id',
  'M6.5 round_progress carries the round, who locked in and how many are present, no film'
);
select is(
  (select (p->'locked'->>0)::uuid from tests.broadcasts(tests.room_id(), 'round_progress') p limit 1),
  tests.member_id('a1'),
  'M6.5 round_progress names the seat that locked in'
);

-- 4. A second ballot answers already_voted and leaves the first as it was.
select is(
  (pg_temp.ballot('a1', array[4, 3, 2, 1]))->>'status',
  'already_voted',
  'M6.5 a second ballot from the same seat answers already_voted'
);
select is(
  (select bool_and(b.rank = c.seed)::text from public.round_ballots b
   join public.round_candidates c on c.round_id = b.round_id and c.title_id = b.title_id
   where b.round_id = pg_temp.rid() and b.room_member_id = tests.member_id('a1') and b.kind = 'rank'),
  'true',
  'M6.5 the first ballot is unchanged by the second'
);

-- 2. A veto writes a veto row and spends the seat's veto.
select is(
  (pg_temp.ballot('a2', array[1, 2, 3], 4))->>'status',
  'ok',
  'M6.5 a ballot with a veto answers ok'
);
select is(
  (select (b.title_id = pg_temp.t(4))::text || '/' || (b.rank is null)::text from public.round_ballots b
   where b.round_id = pg_temp.rid() and b.room_member_id = tests.member_id('a2') and b.kind = 'veto'),
  'true/true',
  'M6.5 a veto writes a veto row on the film, with no rank'
);
select is(
  (select count(*) from public.round_ballots b where b.round_id = pg_temp.rid() and b.room_member_id = tests.member_id('a2')),
  4::bigint,
  'M6.5 a vetoing ballot is the veto row and one rank row per other film, no pass row'
);
select is(
  (select m.vetoes_left::integer from public.room_members m where m.id = tests.member_id('a2')),
  0,
  'M6.5 a veto spends the seat''s vetoes_left'
);
update public.room_members set vetoes_left = 0 where id = tests.member_id('a3');
select is(
  (pg_temp.ballot('a3', array[1, 2, 3], 4))->>'status',
  'no_veto',
  'M6.5 a veto with none left answers no_veto'
);
select is(
  (select count(*) from public.round_ballots b where b.round_id = pg_temp.rid() and b.room_member_id = tests.member_id('a3')),
  0::bigint,
  'M6.5 a refused ballot writes nothing'
);
-- A ranked vote has no veto.
select pg_temp.finale(3, 'r');
update public.rounds set kind = 'ranked_vote' where id = pg_temp.rid();
select is(
  (pg_temp.ballot('r1', array[1, 2, 3], 4))->>'status',
  'no_veto',
  'M6.5 a veto in a ranked_vote round answers no_veto'
);
select is(
  (pg_temp.ballot('r1', array[1, 2, 3, 4]))->>'status',
  'ok',
  'M6.5 a ranked_vote ballot without a veto answers ok'
);

-- 3. invalid: the order is exactly the round's films minus the veto.
select pg_temp.finale(3, 'c');
select is((pg_temp.ballot('c1', array[1, 2, 3]))->>'status', 'invalid', 'M6.5 a film missing from the order answers invalid');
select is((pg_temp.ballot('c1', array[1, 2, 3, 4, 4]))->>'status', 'invalid', 'M6.5 a film twice in the order answers invalid');
select is((pg_temp.ballot('c1', array[1, 1, 3, 4]))->>'status', 'invalid', 'M6.5 a repeated film answers invalid');
select is((pg_temp.ballot('c1', array[1, 2, 3, 4], 4))->>'status', 'invalid', 'M6.5 the vetoed film in the order answers invalid');
select is(
  (pg_temp.raw('c1', array[pg_temp.t(1), pg_temp.t(2), pg_temp.t(3), pg_temp.t(4), tests.film(24)]))->>'status',
  'invalid',
  'M6.5 a film that is not in the round answers invalid'
);
select is(
  (pg_temp.raw('c1', array[pg_temp.t(1), pg_temp.t(2), pg_temp.t(3)], tests.film(24)))->>'status',
  'invalid',
  'M6.5 a veto that is not in the round answers invalid'
);
select is(
  (pg_temp.raw('c1', null))->>'status',
  'invalid',
  'M6.5 a null order answers invalid'
);
select is(
  (select count(*) from public.round_ballots b where b.round_id = pg_temp.rid()),
  0::bigint,
  'M6.5 positive control: every invalid ballot wrote nothing, and the seat can still vote'
);
select is((pg_temp.ballot('c1', array[4, 3, 2, 1]))->>'status', 'ok', 'M6.5 the seat then sends a valid ballot');

-- 5. A seat that left cannot vote; a ballot locked in before leaving still counts.
select pg_temp.finale(3, 'd');
update public.room_members set left_at = now() where id = tests.member_id('d3');
select is((pg_temp.ballot('d3', array[1, 2, 3, 4]))->>'status', 'not_in_room', 'M6.5 a seat that left answers not_in_room');
select pg_temp.ballot('d1', array[3, 1, 2, 4]);
update public.room_members set left_at = now() where id = tests.member_id('d1');
update public.room_members set left_at = now() where id = tests.member_id('d2');
select pg_temp.past(3);
select is(pg_temp.close_as('d2')->>'status', 'ok', 'M6.5 positive control: the round closes at its deadline');
select is(
  pg_temp.winner_seed() || '/' || pg_temp.reason(),
  '3/points',
  'M6.5 a ballot locked in before its player left still counts'
);
select pg_temp.mark();
select tests.authenticate_as('outsider');
select throws_ok(
  format('select api.cast_ballot(%L, array[1::bigint])', current_setting('t.r')),
  '42501', null,
  'M6.5 a caller with no seat in the room raises 42501'
);
select throws_ok(
  $$select api.cast_ballot('00000000-0000-0000-0000-000000000000', array[1::bigint])$$,
  '42501', null,
  'M6.5 a round that does not exist raises 42501'
);
select tests.clear_authentication();

-- 6. The deadline has a 2 second grace.
select pg_temp.finale(3, 'e');
select pg_temp.past(3);
select is((pg_temp.ballot('e1', array[1, 2, 3, 4]))->>'status', 'closed', 'M6.5 3 seconds past the deadline answers closed');
select pg_temp.past(1);
select is((pg_temp.ballot('e1', array[1, 2, 3, 4]))->>'status', 'ok', 'M6.5 1 second past the deadline is accepted (the grace)');
select pg_temp.past(3);
select pg_temp.close_as('e2');
select is((pg_temp.ballot('e2', array[1, 2, 3, 4]))->>'status', 'closed', 'M6.5 a ballot after the close answers closed');

-- 7. The last present seat closes the round at once.
select pg_temp.finale(3, 'f');
select pg_temp.ballot('f1', array[1, 2, 3, 4]);
select pg_temp.ballot('f2', array[1, 2, 3, 4]);
select is(
  (select ro.stage::text || '/' || r.state::text from public.rounds ro join public.rooms r on r.id = ro.room_id where ro.id = pg_temp.rid()),
  'vote/finale',
  'M6.5 with a seat still to lock in, the round stays open'
);
create temp table v_f3 as select pg_temp.ballot('f3', array[1, 2, 3, 4]) as a;
select is(
  (select a->>'status' from v_f3) || '/' ||
  (select ro.stage::text || '/' || r.state::text from public.rounds ro join public.rooms r on r.id = ro.room_id where ro.id = pg_temp.rid()),
  'ok/closed/done',
  'M6.5 the last present seat''s ballot closes the round and ends the room'
);

-- A silent seat is not present: it does not hold the early close up, and a seat that rejoins can vote.
select pg_temp.finale(3, 'h');
update public.room_members set last_active_at = now() - interval '5 minutes' where id = tests.member_id('h3');
select pg_temp.ballot('h1', array[1, 2, 3, 4]);
select is(
  (select ro.stage::text from public.rounds ro where ro.id = pg_temp.rid()),
  'vote',
  'M6.5 positive control: one of two present seats locked in, the round is open'
);
create temp table v_h2 as select pg_temp.ballot('h2', array[1, 2, 3, 4]) as a;
select is(
  (select a->>'of' from v_h2) || '/' ||
  (select ro.stage::text from public.rounds ro where ro.id = pg_temp.rid()),
  '2/closed',
  'M6.5 a silent seat does not hold up the early close (of counts present seats only)'
);

-- Every present seat has gone: no early close, the round closes at its deadline.
select pg_temp.finale(3, 'g');
select pg_temp.ballot('g1', array[1, 2, 3, 4]);
update public.room_members set left_at = now() where room_id = tests.room_id();
select is(
  pg_temp.close_as('g1')->>'status',
  'not_yet',
  'M6.5 with every present seat gone the round does not close early'
);
select pg_temp.past(3);
select is(pg_temp.close_as('g1')->>'status', 'ok', 'M6.5 it closes at the deadline');

-- 8. close_round_stage: not_yet, ok, closed; two phones at once change nothing.
select pg_temp.finale(3, 'i');
select pg_temp.ballot('i1', array[1, 2, 3, 4]);
create temp table v_i1 as select pg_temp.close_as('i1') as a;
select is(
  (select a->>'status' from v_i1) || '/' ||
  ((select a->>'closes_at' from v_i1)::timestamptz = (select ro.stage_closes_at + interval '2 seconds' from public.rounds ro where ro.id = pg_temp.rid())),
  'not_yet/true',
  'M6.5 before the deadline with ballots missing: not_yet, with the deadline plus the 2 seconds'
);
select pg_temp.past(1);
select is(pg_temp.close_as('i2')->>'status', 'not_yet', 'M6.5 1 second past the stage end is still inside the grace: not_yet');
select pg_temp.past(3);
create temp table v_i2 as select pg_temp.close_as('i2') as a;
create temp table v_i3 as select pg_temp.close_as('i3') as a;
select is((select a->>'status' from v_i2), 'ok', 'M6.5 after the deadline plus 2 seconds the first phone closes the round');
select is((select a->>'status' from v_i3), 'closed', 'M6.5 the second phone finds it closed');
select is(
  (select a->>'winner_title_id' from v_i3),
  (select a->>'winner_title_id' from v_i2),
  'M6.5 both phones get the same winner'
);
select is(
  (select count(*) from public.matches m where m.room_id = tests.room_id()),
  1::bigint,
  'M6.5 two phones closing leave one matches row'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'match')) || '/' ||
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') p where p->>'state' = 'done'),
  '1/1',
  'M6.5 and one match and one done state_changed broadcast'
);
select pg_temp.mark();
select tests.authenticate_as('outsider');
select throws_ok(
  format('select api.close_round_stage(%L)', current_setting('t.r')),
  '42501', null,
  'M6.5 close_round_stage for a caller with no seat raises 42501'
);
select tests.clear_authentication();

-- 9. Vetoes. Two films with no veto stay in; the others are knocked out.
select pg_temp.finale(3, 'j');
select pg_temp.ballot('j1', array[1, 2, 3], 4);
select pg_temp.ballot('j2', array[2, 1, 4], 3);
select is(pg_temp.pts() || '/' || pg_temp.out(), '0/0/0/0/', 'M6.5 positive control: nothing is counted before the close');
select pg_temp.ballot('j3', array[2, 1, 3, 4]);
select is(pg_temp.out(), '3,4', 'M6.5 2 films with no veto: only they stay in, the vetoed ones are knocked out');
select is(pg_temp.pts(), '4/5/0/0', 'M6.5 only the films still in score: 2 and 1 points per ballot, knocked-out films keep 0');
select is(pg_temp.winner_seed() || '/' || pg_temp.reason(), '2/points', 'M6.5 the most points wins, with reason points');

-- Exactly one film with no veto wins.
select pg_temp.finale(3, 'k');
select pg_temp.ballot('k1', array[2, 3, 4], 1);
select pg_temp.ballot('k2', array[1, 3, 4], 2);
select pg_temp.ballot('k3', array[1, 2, 4], 3);
select is(
  pg_temp.winner_seed() || '/' || pg_temp.out(), '4/1,2,3',
  'M6.5 the last ballot closed the round: the only film nobody vetoed wins and the others are knocked out'
);
select is(pg_temp.reason(), 'only_unvetoed', 'M6.5 that win has reason only_unvetoed');

-- Every film vetoed: the 2 with the fewest vetoes stay in, a tie going to the better seed.
select pg_temp.finale(3, 'l');
select pg_temp.keep(3);
select pg_temp.ballot('l1', array[2, 3], 1);
select pg_temp.ballot('l2', array[1, 3], 2);
select pg_temp.ballot('l3', array[2, 1], 3);
select is(pg_temp.out(), '3', 'M6.5 every film vetoed once: the 2 best seeds stay in, neither is marked vetoed');
-- A film still in that this ballot vetoed comes last on it (it scores 1 there).
select is(pg_temp.pts(), '4/5/0', 'M6.5 a film still in that a ballot vetoed scores last on that ballot');
select is(pg_temp.winner_seed() || '/' || pg_temp.reason(), '2/points', 'M6.5 the winner of the all-vetoed round');

-- Every film vetoed, with different counts: the fewest vetoes stay in whatever their seed.
select pg_temp.finale(4, 'm');
select pg_temp.keep(3);
select pg_temp.ballot('m1', array[1, 3], 2);
select pg_temp.ballot('m2', array[1, 3], 2);
select pg_temp.ballot('m3', array[2, 3], 1);
select pg_temp.ballot('m4', array[1, 2], 3);
select is(pg_temp.out(), '2', 'M6.5 every film vetoed, unevenly: the 2 with the fewest vetoes stay in (1 and 3)');

-- 10. Points over 3 films still in: 3, 2 and 1.
select pg_temp.finale(3, 'n');
select pg_temp.ballot('n1', array[1, 2, 3], 4);
select pg_temp.ballot('n2', array[3, 2, 1, 4]);
select pg_temp.ballot('n3', array[2, 3, 1, 4]);
select is(pg_temp.pts() || '/' || pg_temp.out(), '5/7/6/0/4', 'M6.5 3 films in: 3, 2 and 1 points per ballot, added up');
select is(pg_temp.winner_seed(), 2, 'M6.5 the film with the most points wins');

-- 11. The tie rules in turn, on two finalists with 3 points each.
create function pg_temp.tie_game(p_prefix text) returns void language plpgsql as $$
begin
  perform pg_temp.finale(3, p_prefix);
  perform pg_temp.keep(2);
  perform pg_temp.ballot(p_prefix || '1', array[1, 2]);
  perform pg_temp.ballot(p_prefix || '2', array[2, 1]);
  -- Same counters on both finalists, then each step sets one apart.
  update public.room_cards set like_count = 2, super_like_count = 0, group_score = 3
    where room_id = tests.room_id() and title_id in (pg_temp.t(1), pg_temp.t(2));
end
$$;

select pg_temp.tie_game('q');
update public.room_cards set super_like_count = 1, like_count = 0, group_score = 0 where room_id = tests.room_id() and title_id = pg_temp.t(2);
update public.room_cards set group_score = 9, like_count = 5 where room_id = tests.room_id() and title_id = pg_temp.t(1);
select pg_temp.past(3);
select pg_temp.close_as('q1');
select is(pg_temp.pts() || '/' || pg_temp.winner_seed(), '3/3/2', 'M6.5 tie: more super likes wins over likes and group score');

select pg_temp.tie_game('s');
update public.room_cards set like_count = 3, group_score = 0 where room_id = tests.room_id() and title_id = pg_temp.t(2);
update public.room_cards set group_score = 9 where room_id = tests.room_id() and title_id = pg_temp.t(1);
select pg_temp.past(3);
select pg_temp.close_as('s1');
select is(pg_temp.pts() || '/' || pg_temp.winner_seed(), '3/3/2', 'M6.5 tie: with equal super likes, more likes wins over group score');

select pg_temp.tie_game('u');
update public.room_cards set group_score = 4 where room_id = tests.room_id() and title_id = pg_temp.t(2);
select pg_temp.past(3);
select pg_temp.close_as('u1');
select is(pg_temp.pts() || '/' || pg_temp.winner_seed(), '3/3/2', 'M6.5 tie: with equal likes, the higher group score wins over the seed');

select pg_temp.tie_game('w');
select pg_temp.past(3);
select pg_temp.close_as('w1');
select is(pg_temp.pts() || '/' || pg_temp.winner_seed(), '3/3/1', 'M6.5 tie: with everything equal, the better seed wins');

-- 12. Nobody voted: the best seed wins.
select pg_temp.finale(3, 'x');
select pg_temp.past(3);
select is(pg_temp.close_as('x1')->>'status', 'ok', 'M6.5 no ballots: the round closes at its deadline');
select is(pg_temp.winner_seed() || '/' || pg_temp.reason() || '/' || pg_temp.pts() || '/' || pg_temp.out() , '1/no_ballots/0/0/0/0/', 'M6.5 no ballots: the best seed wins with reason no_ballots');

-- 13. What a close writes.
select pg_temp.finale(3, 'y');
update public.room_cards set like_count = 2, super_like_count = 1 where room_id = tests.room_id() and title_id = pg_temp.t(1);
select pg_temp.ballot('y1', array[1, 2, 3], 4);
select pg_temp.ballot('y2', array[1, 2, 3, 4]);
select pg_temp.ballot('y3', array[1, 2, 3, 4]);
select is(
  (select ro.stage::text || '/' || (ro.closed_at is not null) || '/' || (ro.winner_title_id = pg_temp.t(1)) from public.rounds ro where ro.id = pg_temp.rid()),
  'closed/true/true',
  'M6.5 the round is closed with its closed_at and winner_title_id'
);
select is(
  (select m.kind::text || '/' || m.pick_order || '/' || m.like_count || '/' || m.present_count from public.matches m where m.room_id = tests.room_id()),
  'finale/1/3/3',
  'M6.5 the pick is a finale match, pick_order 1, likes plus super likes, present seats at the close'
);
select is(
  (select r.state::text || '/' || (r.decided_at is not null) || '/' || (r.ended_at is not null) from public.rooms r where r.id = tests.room_id()),
  'done/true/true',
  'M6.5 the room is done with decided_at and ended_at'
);
select is(
  (select rc.vetoed_by from public.round_candidates rc where rc.round_id = pg_temp.rid() and rc.seed = 4),
  tests.member_id('y1'),
  'M6.5 vetoed_by is stored for a knocked-out film'
);
select is(
  (select count(*) from public.round_candidates rc where rc.round_id = pg_temp.rid() and rc.vetoed_at is not null),
  1::bigint,
  'M6.5 vetoed_at marks only the knocked-out film'
);
select is(
  (select array_to_string(array(select k from jsonb_object_keys(p) k where k <> 'id' order by k), ',') from tests.broadcasts(tests.room_id(), 'match') p limit 1),
  'decided,finalists,kind,likes,of,reason,title_id',
  'M6.5 the match broadcast carries the pick, its counts, the reason and the finalists'
);
select is(
  (select jsonb_agg(f order by (f->>'seed')::int) from tests.broadcasts(tests.room_id(), 'match') p, jsonb_array_elements(p->'finalists') f)::text,
  (select jsonb_agg(jsonb_build_object('title_id', rc.title_id, 'seed', rc.seed, 'points', rc.points, 'vetoed', rc.vetoed_at is not null) order by rc.seed)::text
   from public.round_candidates rc where rc.round_id = pg_temp.rid()),
  'M6.5 the finalists of the broadcast are each film with its seed, points and whether it was knocked out'
);
select is(
  (select (p->>'kind') || '/' || (p->>'decided') || '/' || (p->>'likes') || '/' || (p->>'of') from tests.broadcasts(tests.room_id(), 'match') p limit 1),
  'finale/true/3/3',
  'M6.5 the match broadcast is a decided finale with 3 likes of 3'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') p where p->>'state' = 'done'),
  1::bigint,
  'M6.5 a done state_changed follows the match'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'match') p where p::text like '%vetoed_by%')
  + (select count(*) from information_schema.columns c where c.table_schema = 'api' and c.column_name = 'vetoed_by'),
  0::bigint,
  'M6.5 vetoed_by is in no payload and no api view'
);
select is(
  (select rc.state::text from public.room_cards rc where rc.room_id = tests.room_id() and rc.title_id = pg_temp.t(1)),
  'matched',
  'M6.5 the winner''s card is matched'
);

-- 14. Before the close the api shows no veto and no points.
select pg_temp.finale(3, 'z');
select pg_temp.ballot('z1', array[1, 2, 3], 4);
select pg_temp.mark();
create temp table z_ids as select pg_temp.t(4) as t4, tests.member_id('z1') as m1, tests.member_id('z2') as m2;
grant select on z_ids to authenticated;
select tests.authenticate_as('z2');
select is(
  (select rc.vetoed::text || '/' || rc.points from api.round_candidates rc where rc.round_id = current_setting('t.r')::uuid and rc.seed = 4),
  'false/0',
  'M6.5 before the close api.round_candidates shows a vetoed film as not vetoed, with 0 points'
);

-- 15. Hiding who vetoed: other seats' spent counts are null.
select is(
  (select s.vetoes_left is null from api.room_seats s where s.member_id = (select m1 from z_ids)),
  true,
  'M6.5 another seat''s vetoes_left is hidden'
);
select is(
  (select s.super_likes_left is null from api.room_seats s where s.member_id = (select m1 from z_ids)),
  true,
  'M6.5 another seat''s super_likes_left is hidden'
);
select is(
  (select s.vetoes_left::text || '/' || s.super_likes_left from api.room_seats s where s.member_id = (select m2 from z_ids)),
  '1/2',
  'M6.5 the caller sees its own vetoes_left and super_likes_left'
);
select tests.authenticate_as('z1');
select is(
  (select s.vetoes_left::text from api.room_seats s where s.member_id = tests.member_id('z1')),
  '0',
  'M6.5 the seat that vetoed sees its own spent veto'
);
select tests.clear_authentication();

-- 16. round_progress for a phone that restarted.
select tests.authenticate_as('z2');
create temp table v_z2 as select api.round_progress(current_setting('t.r')::uuid) as a;
select tests.authenticate_as('z1');
create temp table v_z1 as select api.round_progress(current_setting('t.r')::uuid) as a;
select tests.clear_authentication();
select is(
  (select a->>'status' || '/' || (a->>'stage') || '/' || jsonb_array_length(a->'locked') || '/' || (a->>'of') || '/' || (a->>'me_locked') from v_z2),
  'ok/vote/1/3/false',
  'M6.5 round_progress answers the stage, who locked in, how many are present and whether the caller did'
);
select is((select a->>'me_locked' from v_z1), 'true', 'M6.5 round_progress tells a locked-in seat so');
select is(
  (select (a->>'closes_at')::timestamptz from v_z2),
  (select ro.stage_closes_at from public.rounds ro where ro.id = pg_temp.rid()),
  'M6.5 round_progress gives the stage deadline'
);
select tests.authenticate_as('outsider');
select throws_ok(
  format('select api.round_progress(%L)', current_setting('t.r')),
  '42501', null,
  'M6.5 round_progress for a caller with no seat raises 42501'
);
select tests.clear_authentication();

select * from finish();
rollback;

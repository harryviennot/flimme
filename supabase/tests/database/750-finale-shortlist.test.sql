-- M6.35: the finale with a shortlist (game-modes.md#the-finalists, #when-it-starts, #how-a-game-ends).
-- The matches are the only candidates; a lone match in Quick Match and Date Night is the pick.

begin;
select plan(42);

select tests.create_catalog(40);
select tests.use_deck_engine('sql');

create function pg_temp.game(p_players integer, p_prefix text, p_mode text default 'quick_match') returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping', p_mode);
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds', expires_at = now() + interval '50 minutes'
  where id = tests.room_id();
end
$$;

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

create function pg_temp.state() returns text language sql as $$
  select r.state::text from public.rooms r where r.id = tests.room_id()
$$;

create function pg_temp.reason() returns text language sql as $$
  select r.finale_reason::text from public.rooms r where r.id = tests.room_id()
$$;

create function pg_temp.rid() returns uuid language sql as $$
  select ro.id from public.rounds ro where ro.room_id = tests.room_id() order by ro.seq desc limit 1
$$;

create function pg_temp.round_films() returns text language sql as $$
  select string_agg(rc.title_id::text, ',' order by rc.seed)
  from public.round_candidates rc where rc.round_id = pg_temp.rid()
$$;

create function pg_temp.films(p_films integer[]) returns text language sql as $$
  select string_agg(tests.film(x)::text, ',' order by o) from unnest(p_films) with ordinality t(x, o)
$$;

create function pg_temp.kind() returns text language sql as $$
  select ro.kind::text from public.rounds ro where ro.id = pg_temp.rid()
$$;

create function pg_temp.rounds() returns bigint language sql as $$
  select count(*) from public.rounds ro where ro.room_id = tests.room_id()
$$;

create function pg_temp.count_of(p_event text) returns bigint language sql as $$
  select count(*) from tests.broadcasts(tests.room_id(), p_event)
$$;

create function pg_temp.card(p_film integer) returns text language sql as $$
  select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(p_film)
$$;

create function pg_temp.swipes_all(p_n integer) returns void language sql as $$
  update public.room_members set swipe_count = p_n where room_id = tests.room_id()
$$;

create function pg_temp.late() returns void language sql as $$
  update public.rooms set started_at = now() - interval '400 seconds' where id = tests.room_id()
$$;

create function pg_temp.sweep() returns text language sql as $$ select internal.sweep_room(tests.room_id()) $$;

-- As the seat, api.cast_ballot with the order given as film numbers.
create function pg_temp.ballot(p_name text, p_order integer[], p_veto integer default null) returns jsonb language plpgsql as $$
declare
  v_films bigint[];
  v_answer jsonb;
  v_round uuid := pg_temp.rid();
  v_veto bigint := case when p_veto is null then null else tests.film(p_veto) end;
begin
  select array_agg(tests.film(x) order by o) into v_films from unnest(p_order) with ordinality t(x, o);
  perform tests.authenticate_as(p_name);
  v_answer := api.cast_ballot(v_round, v_films, v_veto);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

create function pg_temp.close_after_deadline(p_name text) returns jsonb language plpgsql as $$
declare
  v_answer jsonb;
  v_round uuid := pg_temp.rid();
begin
  update public.rounds set stage_closes_at = now() - interval '5 seconds' where id = v_round;
  perform tests.authenticate_as(p_name);
  v_answer := api.close_round_stage(v_round);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

create function pg_temp.winner() returns bigint language sql as $$
  select ro.winner_title_id from public.rounds ro where ro.id = pg_temp.rid()
$$;

create function pg_temp.result_reason() returns text language sql as $$
  select m->>'reason' from tests.broadcasts(tests.room_id(), 'match') m where (m->>'decided')::boolean limit 1
$$;

-- 1. Three matches in Quick Match with 3 players: the matches only, seeded by likes, group score, id.
select pg_temp.game(3, 'a');
select pg_temp.all_like('a', 3, 1);
select pg_temp.all_like('a', 3, 2);
update public.room_cards set group_score = 0.9 where room_id = tests.room_id() and title_id = tests.film(3);
update public.room_cards set group_score = 0.5 where room_id = tests.room_id() and title_id = tests.film(1);
update public.room_cards set group_score = 0.1 where room_id = tests.room_id() and title_id = tests.film(2);
select pg_temp.all_like('a', 3, 3);
select is(pg_temp.state(), 'finale', 'M6.35 the third match opens the finale');
select is(pg_temp.round_films(), pg_temp.films(array[3, 1, 2]), 'M6.35 the candidates are exactly the 3 matches, no fill though the size is 4');
select is(pg_temp.kind(), 'final_cut', 'M6.35 three matches with 3 players make a final_cut round');
select is(pg_temp.card(1) || '/' || pg_temp.card(3), 'matched/matched', 'M6.35 matched cards stay matched');

-- 2. Three matches with 6 players: ranked_vote.
select pg_temp.game(6, 'b');
select pg_temp.all_like('b', 6, 1);
select pg_temp.all_like('b', 6, 2);
select pg_temp.all_like('b', 6, 3);
select is(pg_temp.kind() || '/' || pg_temp.round_films(), 'ranked_vote/' || pg_temp.films(array[1, 2, 3]),
  'M6.35 three matches with 6 players: ranked_vote of the 3 matches');

-- 3. Three matches in Final Cut mode and in Date Night.
select pg_temp.game(3, 'c', 'final_cut');
select pg_temp.all_like('c', 3, 1);
select pg_temp.all_like('c', 3, 2);
select pg_temp.all_like('c', 3, 3);
select is(pg_temp.round_films(), pg_temp.films(array[1, 2, 3]), 'M6.35 Final Cut mode: the 3 matches only');
select pg_temp.game(2, 'd', 'date_night');
select pg_temp.all_like('d', 2, 1);
select pg_temp.all_like('d', 2, 2);
select pg_temp.all_like('d', 2, 3);
select is(pg_temp.round_films(), pg_temp.films(array[1, 2, 3]), 'M6.35 Date Night: the 3 matches only');

-- 4. Two matches at the card count in Quick Match.
select pg_temp.game(3, 'e');
select pg_temp.all_like('e', 3, 1);
select pg_temp.all_like('e', 3, 2);
select pg_temp.swipes_all(39);
select tests.vote('e1', 25, 'nope');
select tests.vote('e2', 25, 'nope');
select tests.vote('e3', 25, 'nope');
select is(pg_temp.state() || '/' || pg_temp.reason(), 'finale/cards', 'M6.35 two matches at the card count open the finale');
select is(pg_temp.round_films(), pg_temp.films(array[1, 2]), 'M6.35 the 2 matches are the candidates');
select is(pg_temp.kind(), 'ranked_vote', 'M6.35 two films make a ranked_vote');
select is(
  (select m->>'kind' from tests.broadcasts(tests.room_id(), 'finale_started') m), 'ranked_vote',
  'M6.35 finale_started carries kind ranked_vote');
select is(pg_temp.card(1) || '/' || pg_temp.card(2), 'matched/matched', 'M6.35 both cards stay matched');

-- 5. Two matches at the time limit in Date Night.
select pg_temp.game(2, 'f', 'date_night');
select pg_temp.all_like('f', 2, 1);
select pg_temp.all_like('f', 2, 2);
select pg_temp.late();
select is(pg_temp.sweep(), 'finale', 'M6.35 the sweeper opens the finale of a Date Night with 2 matches');
select is(pg_temp.reason() || '/' || pg_temp.kind() || '/' || pg_temp.round_films(), 'time/ranked_vote/' || pg_temp.films(array[1, 2]),
  'M6.35 Date Night at the time limit: the 2 matches in a ranked_vote');

-- 6. One match at the card count in Quick Match: the pick, no vote.
select pg_temp.game(3, 'g');
select pg_temp.all_like('g', 3, 1);
select pg_temp.swipes_all(39);
select tests.vote('g1', 25, 'nope');
select tests.vote('g2', 25, 'nope');
create temp table v_g as select tests.vote('g3', 25, 'nope') as a;
select is(
  (select mt.pick_order::text || '/' || mt.kind::text || '/' || mt.like_count || '/' || mt.present_count
   from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(1)),
  '1/unanimous/3/3', 'M6.35 the only match gets pick_order 1 and keeps its kind and counts');
select is(
  pg_temp.state() || '/' || pg_temp.reason() || '/' ||
  (select (r.finale_at is not null and r.decided_at is not null and r.ended_at is not null)::text from public.rooms r where r.id = tests.room_id()),
  'done/cards/true', 'M6.35 the room is done with finale_at, decided_at, ended_at and reason cards');
select is(pg_temp.rounds() || '/' || pg_temp.count_of('finale_started'), '0/0', 'M6.35 no round and no finale_started');
select is(
  (select m->>'decided' || '/' || (m->>'reason') || '/' || (m->>'likes') || '/' || (m->>'of') || '/' || (m->>'kind') || '/' || (m ? 'finalists')::text
   from tests.broadcasts(tests.room_id(), 'match') m where (m->>'decided')::boolean),
  'true/only_match/3/3/unanimous/false', 'M6.35 the decided match says only_match with the row counts and no finalists');
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s->>'state' = 'done'), 1::bigint,
  'M6.35 state_changed done is sent');
select is((select a->>'state' from v_g), 'done', 'M6.35 the vote that triggered it answers state done');

-- 7. The same at the time limit, with every seat done, and in Date Night.
select pg_temp.game(3, 'h');
select pg_temp.all_like('h', 3, 1);
select pg_temp.late();
select is(pg_temp.sweep(), 'finale', 'M6.35 the sweeper ends a one-match game at the time limit');
select is(pg_temp.state() || '/' || pg_temp.reason() || '/' || pg_temp.rounds(), 'done/time/0', 'M6.35 time limit: done, no round');
select pg_temp.game(3, 'i');
select pg_temp.all_like('i', 3, 1);
update public.room_members set done_at = now() - interval '10 seconds' where room_id = tests.room_id();
select pg_temp.sweep();
select is(pg_temp.state() || '/' || pg_temp.reason() || '/' || pg_temp.rounds(), 'done/all_done/0', 'M6.35 all done: done, no round');
select pg_temp.game(2, 'j', 'date_night');
select pg_temp.all_like('j', 2, 1);
select pg_temp.late();
select pg_temp.sweep();
select is(pg_temp.state() || '/' || pg_temp.rounds() || '/' || pg_temp.result_reason(), 'done/0/only_match', 'M6.35 Date Night: one match is the pick');

-- 8. Final Cut mode with 1 and 2 matches keeps today's path: matches first, then the fill.
select pg_temp.game(3, 'k', 'final_cut');
select pg_temp.all_like('k', 3, 1);
select tests.vote('k1', 5, 'like');
select tests.vote('k1', 6, 'like');
select tests.vote('k1', 7, 'like');
select pg_temp.late();
select pg_temp.sweep();
select is(pg_temp.state() || '/' || (pg_temp.round_films() like tests.film(1)::text || ',%')::text || '/' || cardinality(string_to_array(pg_temp.round_films(), ',')),
  'finale/true/4', 'M6.35 Final Cut mode, 1 match: the match first, then the fill to 4');
select pg_temp.game(3, 'l', 'final_cut');
select pg_temp.all_like('l', 3, 1);
select pg_temp.all_like('l', 3, 2);
select tests.vote('l1', 5, 'like');
select tests.vote('l1', 6, 'like');
select pg_temp.late();
select pg_temp.sweep();
select is(pg_temp.state() || '/' || (pg_temp.round_films() like tests.film(1)::text || ',' || tests.film(2)::text || ',%')::text || '/' || cardinality(string_to_array(pg_temp.round_films(), ',')),
  'finale/true/4', 'M6.35 Final Cut mode, 2 matches: the matches first, then the fill to 4');

-- 9. No match: the finalists come from the swipes.
select pg_temp.game(3, 'm');
select tests.vote('m1', 1, 'like');
select tests.vote('m1', 2, 'like');
select tests.vote('m2', 2, 'like');
select pg_temp.late();
select pg_temp.sweep();
select is(pg_temp.state() || '/' || split_part(pg_temp.round_films(), ',', 1), 'finale/' || tests.film(2)::text,
  'M6.35 no match: the finalists are built from the swipes');

-- 10. A 2-film ranked vote's ballots.
select pg_temp.game(3, 'n');
select pg_temp.all_like('n', 3, 1);
select pg_temp.all_like('n', 3, 2);
select pg_temp.late();
select pg_temp.sweep();
select is((pg_temp.ballot('n1', array[1, 2]))->>'status', 'ok', 'M6.35 a ballot ranking both films is ok');
select is((pg_temp.ballot('n2', array[1, 2], 2))->>'status', 'no_veto', 'M6.35 a veto in a 2-film ranked vote answers no_veto');
select is((pg_temp.ballot('n2', array[1]))->>'status', 'invalid', 'M6.35 ranking one of the 2 films is invalid');
select is((pg_temp.ballot('n2', array[1, 3]))->>'status', 'invalid', 'M6.35 ranking a film outside the round is invalid');

-- 11. Three ballots close the round: 2 and 1 points, the most points wins.
select pg_temp.ballot('n2', array[1, 2]);
select pg_temp.ballot('n3', array[2, 1]);
select is(
  (select string_agg(rc.points::text, '/' order by rc.seed) from public.round_candidates rc where rc.round_id = pg_temp.rid()),
  '5/4', 'M6.35 each ballot gives 2 and 1 points');
select is(pg_temp.winner(), tests.film(1), 'M6.35 the film with the most points wins');
select is(pg_temp.result_reason(), 'points', 'M6.35 the reason is points');
select is(pg_temp.state(), 'done', 'M6.35 the room is done');

-- Points tie: super likes, then likes, then group score.
select pg_temp.game(2, 'o');
select pg_temp.all_like('o', 2, 1);
select tests.vote('o1', 2, 'super_like');
select tests.vote('o2', 2, 'like');
select pg_temp.late();
select pg_temp.sweep();
select pg_temp.ballot('o1', array[1, 2]);
select pg_temp.ballot('o2', array[2, 1]);
select is(pg_temp.winner(), tests.film(2), 'M6.35 a points tie goes to the film with more super likes');
select pg_temp.game(2, 'p');
select pg_temp.all_like('p', 2, 1);
select pg_temp.all_like('p', 2, 2);
update public.room_cards set group_score = 0.2 where room_id = tests.room_id() and title_id = tests.film(1);
update public.room_cards set group_score = 0.8 where room_id = tests.room_id() and title_id = tests.film(2);
select pg_temp.late();
select pg_temp.sweep();
select pg_temp.ballot('p1', array[1, 2]);
select pg_temp.ballot('p2', array[2, 1]);
select is(pg_temp.winner(), tests.film(2), 'M6.35 a points tie with equal likes goes to the higher group score');

-- 12. No ballots: seed 1 wins.
select pg_temp.game(3, 'q');
select pg_temp.all_like('q', 3, 1);
select pg_temp.all_like('q', 3, 2);
select pg_temp.late();
select pg_temp.sweep();
select pg_temp.close_after_deadline('q1');
select is(pg_temp.winner() = split_part(pg_temp.round_films(), ',', 1)::bigint and pg_temp.result_reason() = 'no_ballots', true,
  'M6.35 no ballots: seed 1 wins with no_ballots');

-- 13. A 3-match Final Cut round: vetoes and points close as before.
select pg_temp.game(3, 'r');
select pg_temp.all_like('r', 3, 1);
select pg_temp.all_like('r', 3, 2);
select pg_temp.all_like('r', 3, 3);
select pg_temp.ballot('r1', array[2, 3], 1);
select pg_temp.ballot('r2', array[1, 3], 2);
select pg_temp.ballot('r3', array[1, 3], 2);
select is(pg_temp.winner() || '/' || pg_temp.result_reason(), tests.film(3)::text || '/only_unvetoed', 'M6.35 a 3-match round: two vetoes leave one film, only_unvetoed');
select pg_temp.game(3, 's');
select pg_temp.all_like('s', 3, 1);
select pg_temp.all_like('s', 3, 2);
select pg_temp.all_like('s', 3, 3);
select pg_temp.ballot('s1', array[2, 1, 3]);
select pg_temp.ballot('s2', array[2, 3, 1]);
select pg_temp.ballot('s3', array[1, 2, 3]);
select is(pg_temp.winner() || '/' || pg_temp.result_reason(), tests.film(2)::text || '/points', 'M6.35 a 3-match round counts points');

-- 14. rooms.stats.
select pg_temp.game(3, 't');
select pg_temp.all_like('t', 3, 1);
select pg_temp.late();
select pg_temp.sweep();
select is((select s->>'outcome' || '/' || (s->>'matches') from internal.write_room_stats(tests.room_id()) s), 'match/1',
  'M6.35 stats: an only_match room has outcome match and matches 1');
select pg_temp.game(3, 'u');
select pg_temp.all_like('u', 3, 1);
select pg_temp.all_like('u', 3, 2);
select pg_temp.late();
select pg_temp.sweep();
select pg_temp.ballot('u1', array[1, 2]);
select pg_temp.ballot('u2', array[1, 2]);
select pg_temp.ballot('u3', array[1, 2]);
select is((select s->>'outcome' || '/' || (s->>'matches') from internal.write_room_stats(tests.room_id()) s), 'finale/2',
  'M6.35 stats: a vote between 2 matches has outcome finale and matches 2');

select * from finish();
rollback;

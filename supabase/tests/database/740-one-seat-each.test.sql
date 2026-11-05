-- M6.36: one seat each among the finalists (game-modes.md#the-finalists, rule 2). The finale's
-- list is built from the shortlist, then the liked film that gives a seat to the most present
-- players who have none, then the rest of the likes, then films nobody has noped. The rule reads
-- votes inside Postgres only: no payload or readable view says who liked what.

begin;
select plan(27);

select tests.create_catalog(40);

-- A swiping game, all seats seated before the start. Every card gets a distinct group score
-- (film n has 100 - n), so ties fall to the film number unless a test sets them otherwise.
create function pg_temp.game(p_players integer, p_prefix text, p_mode text default 'quick_match')
returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping', p_mode);
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds', seen_rule = 'allow_rewatch'
    where id = tests.room_id();
  update public.room_cards c set group_score = 100 - g.n
    from generate_series(1, 40) g(n)
    where c.room_id = tests.room_id() and c.title_id = tests.film(g.n);
end
$$;

-- An answer written straight into votes with the counters it would move, so no match or finale
-- fires on its own: the test opens the finale itself.
create function pg_temp.ans(p_name text, p_film integer, p_answer public.vote_answer default 'like')
returns void language plpgsql as $$
begin
  insert into public.votes (room_id, room_member_id, title_id, answer)
  values (tests.room_id(), tests.member_id(p_name), tests.film(p_film), p_answer);
  update public.room_cards
  set like_count = like_count + (p_answer in ('like', 'seen_rewatch'))::int,
      super_like_count = super_like_count + (p_answer = 'super_like')::int,
      nope_count = nope_count + (p_answer in ('nope', 'seen'))::int
  where room_id = tests.room_id() and title_id = tests.film(p_film);
end
$$;

-- Opens the finale with the given list size and answers the list as film numbers.
create function pg_temp.fin(p_size integer default 4) returns text language plpgsql as $$
begin
  perform internal.start_finale(tests.room_id(),
    jsonb_build_object('finale_kind', 'final_cut', 'finale_size', p_size), 'time');
  return (select string_agg(g.n::text, ',' order by rc.seed)
          from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
          cross join lateral (select n from generate_series(1, 40) n where tests.film(n) = rc.title_id) g
          where ro.room_id = tests.room_id());
end
$$;

-- 1. A player whose only like ranks below the top 4 still gets a finalist.
select pg_temp.game(4, 'a');
select pg_temp.ans('a1', 1); select pg_temp.ans('a1', 2); select pg_temp.ans('a1', 3);
select pg_temp.ans('a2', 1); select pg_temp.ans('a2', 2); select pg_temp.ans('a2', 4);
select pg_temp.ans('a3', 1); select pg_temp.ans('a3', 5); select pg_temp.ans('a3', 3);
select pg_temp.ans('a4', 6);
select is(pg_temp.fin(), '1,6,2,3', 'one seat each: the fourth player''s only like (below the top 4) is a finalist, the list stays at 4');

-- 2. A player who liked nothing gets no seat.
select pg_temp.game(3, 'b');
select pg_temp.ans('b1', 1); select pg_temp.ans('b1', 2);
select pg_temp.ans('b2', 3);
select is(pg_temp.fin(), '1,3,2,4', 'one seat each: a player who liked nothing keeps no seat, the rest is rules 3 and 4');

-- 3. Six players with one different like each: four of those films, by rule 3 order.
select pg_temp.game(6, 'c');
select pg_temp.ans('c1', 1); select pg_temp.ans('c2', 2); select pg_temp.ans('c3', 3);
select pg_temp.ans('c4', 4); select pg_temp.ans('c5', 5); select pg_temp.ans('c6', 6);
update public.room_cards set group_score = case title_id
  when tests.film(6) then 10 when tests.film(5) then 9 when tests.film(4) then 8
  when tests.film(3) then 7 when tests.film(2) then 6 when tests.film(1) then 5 else 0 end
  where room_id = tests.room_id();
select is(pg_temp.fin(), '6,5,4,3', 'one seat each: six single likes and four seats, the best four by rule 3 order');

-- 4. A film that gives seats to three players comes before a better ranked film that gives one.
select pg_temp.game(4, 'd');
select pg_temp.ans('d1', 5); select pg_temp.ans('d2', 5); select pg_temp.ans('d3', 5);
select pg_temp.ans('d4', 6);
update public.room_cards set like_count = 9 where room_id = tests.room_id() and title_id = tests.film(6);
select is(pg_temp.fin(), '5,6,1,2', 'one seat each: three uncovered players beat one, whatever the rank');

-- 5. Ties: rank, then group score, then the lowest film id.
select pg_temp.game(2, 'e');
select pg_temp.ans('e1', 1); select pg_temp.ans('e2', 2);
update public.room_cards set like_count = 3 where room_id = tests.room_id() and title_id = tests.film(2);
select is(left(pg_temp.fin(3), 3), '2,1', 'one seat each: equal seats, the higher rank first');

select pg_temp.game(2, 'f');
select pg_temp.ans('f1', 1); select pg_temp.ans('f2', 2);
update public.room_cards set group_score = 5 where room_id = tests.room_id() and title_id = tests.film(1);
update public.room_cards set group_score = 9 where room_id = tests.room_id() and title_id = tests.film(2);
select is(left(pg_temp.fin(3), 3), '2,1', 'one seat each: equal seats and rank, the higher group score first');

select pg_temp.game(2, 'g');
select pg_temp.ans('g1', 1); select pg_temp.ans('g2', 2);
update public.room_cards set group_score = 5 where room_id = tests.room_id() and title_id in (tests.film(1), tests.film(2));
select pg_temp.fin(3);
select is(
  (select rc.title_id from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
   where ro.room_id = tests.room_id() and rc.seed = 1),
  least(tests.film(1), tests.film(2)),
  'one seat each: equal seats, rank and group score, the lowest film id first');

-- 6. A seat that left is not forced in; a late joiner who is present is.
select pg_temp.game(3, 'h');
select pg_temp.ans('h1', 1); select pg_temp.ans('h1', 2); select pg_temp.ans('h1', 3); select pg_temp.ans('h1', 4);
select pg_temp.ans('h2', 1);
select pg_temp.ans('h3', 9);
update public.room_members set left_at = now() where id = tests.member_id('h3');
select is(pg_temp.fin(), '1,2,3,4', 'one seat each: a seat that left and liked only film 9 does not force it in');

select pg_temp.game(3, 'i');
select pg_temp.ans('i1', 1); select pg_temp.ans('i1', 2); select pg_temp.ans('i1', 3); select pg_temp.ans('i1', 4);
select pg_temp.ans('i2', 1);
select pg_temp.ans('i3', 9);
update public.room_members set joined_at = now() where id = tests.member_id('i3');
select is(pg_temp.fin(), '1,9,2,3', 'one seat each: a late joiner who is present and liked only film 9 gets it');

-- 7. A seat silent for over 90 seconds is not present.
select pg_temp.game(3, 'j');
select pg_temp.ans('j1', 1); select pg_temp.ans('j1', 2); select pg_temp.ans('j1', 3); select pg_temp.ans('j1', 4);
select pg_temp.ans('j2', 1);
select pg_temp.ans('j3', 9);
update public.room_members set last_active_at = now() - interval '2 minutes' where id = tests.member_id('j3');
select is(pg_temp.fin(), '1,2,3,4', 'one seat each: a silent seat (not left) that liked only film 9 does not force it in');

-- 8. A player who liked a shortlisted match needs no extra seat.
select pg_temp.game(3, 'k', 'final_cut');
select pg_temp.ans('k1', 1); select pg_temp.ans('k2', 1); select pg_temp.ans('k3', 1);
select pg_temp.ans('k1', 9);
select pg_temp.ans('k2', 5); select pg_temp.ans('k2', 6); select pg_temp.ans('k2', 7);
update public.room_cards set state = 'matched' where room_id = tests.room_id() and title_id = tests.film(1);
select is(pg_temp.fin(), '1,5,6,7', 'one seat each: every player liked the match, so film 9 (one like) keeps no seat');

-- 9. Super like and "watch it again" count; a plain "Seen it" in an allow_rewatch room does not.
select pg_temp.game(2, 'l');
select pg_temp.ans('l1', 1); select pg_temp.ans('l1', 2); select pg_temp.ans('l1', 3); select pg_temp.ans('l1', 4);
select pg_temp.ans('l2', 9, 'super_like');
select is(pg_temp.fin(), '9,1,2,3', 'one seat each: a super like is a like for the seat');

select pg_temp.game(2, 'm');
select pg_temp.ans('m1', 1); select pg_temp.ans('m1', 2); select pg_temp.ans('m1', 3); select pg_temp.ans('m1', 4);
select pg_temp.ans('m2', 9, 'seen_rewatch');
select is(pg_temp.fin(), '1,9,2,3', 'one seat each: "Watch it again tonight? Yes" is a like for the seat');

select pg_temp.game(2, 'n');
select pg_temp.ans('n1', 1); select pg_temp.ans('n1', 2); select pg_temp.ans('n1', 3); select pg_temp.ans('n1', 4);
select pg_temp.ans('n2', 9, 'seen');
select is(pg_temp.fin(), '1,2,3,4', 'one seat each: a plain "Seen it" in a room that allows rewatches is not a like');

-- 10. A film everyone else noped still has a like, so it can take that player's seat.
select pg_temp.game(3, 'o');
select pg_temp.ans('o1', 1); select pg_temp.ans('o2', 1);
select pg_temp.ans('o1', 2); select pg_temp.ans('o2', 2);
select pg_temp.ans('o1', 3); select pg_temp.ans('o2', 3);
select pg_temp.ans('o1', 4); select pg_temp.ans('o2', 4);
select pg_temp.ans('o3', 9);
select pg_temp.ans('o1', 9, 'nope'); select pg_temp.ans('o2', 9, 'nope');
select is(pg_temp.fin(), '1,9,2,3', 'one seat each: a film liked by one and noped by the others takes that player''s seat');

-- 11. The seeds follow the list: matches, rule 2 in the order taken, rule 3, rule 4.
select pg_temp.game(3, 'p');
select pg_temp.ans('p1', 1); select pg_temp.ans('p1', 4);
select pg_temp.ans('p2', 2);
select pg_temp.ans('p3', 3);
update public.room_cards set like_count = like_count + 5 where room_id = tests.room_id() and title_id = tests.film(4);
update public.room_cards set state = 'matched' where room_id = tests.room_id() and title_id = tests.film(1);
update public.room_cards set like_count = like_count + 2 where room_id = tests.room_id() and title_id = tests.film(3);
select is(pg_temp.fin(6), '1,3,2,4,5,6', 'one seat each: seeds are matches, then seats in the order taken, then likes, then unnoped films');
select is(
  (select string_agg(rc.seed::text, ',' order by rc.seed) from public.round_candidates rc
   join public.rounds ro on ro.id = rc.round_id where ro.room_id = tests.room_id()),
  '1,2,3,4,5,6',
  'one seat each: the seeds are 1 to the list size'
);

-- 12. Two players, each with a like only the other noped: both films are in, a third fills.
select pg_temp.game(2, 'q');
select pg_temp.ans('q1', 1); select pg_temp.ans('q2', 1, 'nope');
select pg_temp.ans('q2', 2); select pg_temp.ans('q1', 2, 'nope');
select is(pg_temp.fin(3), '1,2,3', 'one seat each: two players, each with a like only the other noped, both films are in and a third fills');

-- 13. One qualifying film is the pick; nothing liked is no pick.
select pg_temp.game(2, 'r');
select pg_temp.ans('r1', 1);
update public.room_cards set nope_count = 1 where room_id = tests.room_id() and title_id <> tests.film(1);
select pg_temp.fin(3);
select is(
  (select (m ->> 'reason') || '/' || (select count(*) from public.rounds where room_id = tests.room_id())
   from tests.broadcasts(tests.room_id(), 'match') m),
  'only_film/0',
  'one seat each: a single qualifying film is still the pick with no vote');

select pg_temp.game(2, 's');
select pg_temp.fin(3);
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id())
  || '/' || (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s ->> 'outcome' = 'no_pick'),
  'done/1',
  'one seat each: nothing liked is still no pick');

-- Dropped cards are never finalists, even when a present seat liked only that film.
select pg_temp.game(3, 't');
select pg_temp.ans('t1', 1); select pg_temp.ans('t2', 1); select pg_temp.ans('t1', 2); select pg_temp.ans('t2', 3);
select pg_temp.ans('t3', 9);
update public.room_cards set state = 'dropped' where room_id = tests.room_id() and title_id = tests.film(9);
select is(pg_temp.fin(), '1,2,3,4', 'one seat each: a dropped card is never a finalist, even if it is a seat''s only like');

-- 14. The finale_started payload keeps exactly its four keys.
select pg_temp.game(4, 'u');
select pg_temp.ans('u1', 1); select pg_temp.ans('u2', 2); select pg_temp.ans('u3', 3); select pg_temp.ans('u4', 4);
select pg_temp.fin();
select is(
  (select array_agg(k order by k) from tests.broadcasts(tests.room_id(), 'finale_started') f, jsonb_object_keys(f) k where k <> 'id'),
  array['closes_at', 'kind', 'round_id', 'title_ids'],
  'one seat each: finale_started carries exactly round_id, title_ids, kind and closes_at');

-- Privacy (realtime.send adds a message id to every payload, which is not a seat): no broadcast names a seat, a player sees only their own votes, the readable views stay as they were.
select is(
  (select count(*) from realtime.messages m
   where m.topic = 'room:' || tests.room_id()::text and m.event in ('finale_started', 'state_changed', 'match')
     and exists (select 1 from public.room_members rm
                 where rm.room_id = tests.room_id() and m.payload::text like '%' || rm.id::text || '%')),
  0::bigint,
  'one seat each: no finale broadcast names a seat');
select is(
  (select array_agg(c.column_name::text order by c.column_name) from information_schema.columns c
   where c.table_schema = 'api' and c.table_name = 'round_candidates'),
  array['points', 'round_id', 'seed', 'title_id', 'vetoed'],
  'one seat each: api.round_candidates still shows no seat');
select tests.authenticate_as('u1');
select is(
  (select count(*) from api.my_votes where room_member_id <> tests.member_id('u1')),
  0::bigint,
  'one seat each: after the finale a player reads no one else''s votes');
select is(
  (select count(*) from api.my_votes where room_member_id = tests.member_id('u1')),
  1::bigint,
  'one seat each: a player still reads their own vote');
select tests.clear_authentication();

-- 15. The finalists leave the pool as before.
select is(
  (select count(*) from public.room_cards where room_id = tests.room_id() and state = 'finalist'),
  4::bigint,
  'one seat each: the four finalists are marked finalist');

select * from finish();
rollback;

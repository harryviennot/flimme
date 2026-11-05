-- M6.48: api.room_runners_up (game-modes.md#after-the-pick, #what-players-see-party-and-blind).
-- After the pick, a seat reads the other finalists (or the most liked films after a single match).
-- Party names who liked each, Blind gives the count only. Before the pick the answer is
-- not_finished and holds nothing. Nopes, seens and the seats that did not like never appear.

begin;
select plan(62);

select tests.create_catalog(40);
select tests.use_deck_engine('sql');

-- A swiping room of p_players seats (a1, a2, ... in seat order), with this reveal mode.
create function pg_temp.game(p_players integer, p_prefix text, p_reveal public.reveal_mode default 'party')
returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix);
  update public.rooms set reveal = p_reveal where id = tests.room_id();
  for i in 1..p_players loop
    update public.room_members set joined_at = now() - interval '1 hour' + i * interval '1 minute'
    where id = tests.member_id(p_prefix || i);
  end loop;
end $$;

-- A vote row written straight into the table (the read looks at votes, not at the counters).
create function pg_temp.v(p_name text, p_film integer, p_answer public.vote_answer) returns void language sql as $$
  insert into public.votes (room_id, room_member_id, title_id, answer)
  values (tests.room_id(), tests.member_id(p_name), tests.film(p_film), p_answer)
$$;

-- The room ends with this film as the pick (a match row, pick_order 1) and a closed round when
-- p_films is given: its candidates in seed order.
create function pg_temp.done(p_pick integer, p_kind public.match_kind default 'unanimous',
                             p_round public.finale_kind default null, p_films integer[] default null)
returns void language plpgsql as $$
declare
  v_round uuid;
begin
  insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order, matched_at)
  values (tests.room_id(), tests.film(p_pick), p_kind, 2, 2, 1, now());
  if p_films is not null then
    insert into public.rounds (room_id, seq, kind, stage, stage_closes_at, closed_at, winner_title_id)
    values (tests.room_id(), 1, p_round, 'closed', now(), now(), tests.film(p_pick))
    returning id into v_round;
    insert into public.round_candidates (round_id, title_id, seed)
    select v_round, tests.film(f), o from unnest(p_films) with ordinality t(f, o);
  end if;
  update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = tests.room_id();
end $$;

create function pg_temp.read(p_name text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.room_runners_up(tests.room_id());
  perform tests.clear_authentication();
  return v;
end $$;

-- Film ids of the answer's list, in order.
create function pg_temp.ids(p_answer jsonb) returns text language sql as $$
  select coalesce(string_agg(r->>'title_id', ',' order by o), '') from jsonb_array_elements(p_answer->'runners_up') with ordinality t(r, o)
$$;
create function pg_temp.films(p_films integer[]) returns text language sql as $$
  select coalesce(string_agg(tests.film(x)::text, ',' order by o), '') from unnest(p_films) with ordinality t(x, o)
$$;
-- The likes of the answer's list, in order.
create function pg_temp.likes(p_answer jsonb) returns text language sql as $$
  select coalesce(string_agg(r->>'likes', ',' order by o), '') from jsonb_array_elements(p_answer->'runners_up') with ordinality t(r, o)
$$;
-- The seat ids of one entry's likers, in order.
create function pg_temp.likers(p_answer jsonb, p_film integer) returns text language sql as $$
  select coalesce(string_agg(l->>'member_id', ',' order by o), '')
  from jsonb_array_elements(p_answer->'runners_up') r,
       jsonb_array_elements(r->'likers') with ordinality t(l, o)
  where (r->>'title_id')::bigint = tests.film(p_film)
$$;
create function pg_temp.seats(p_prefix text, p_seats integer[]) returns text language sql as $$
  select coalesce(string_agg(tests.member_id(p_prefix || s)::text, ',' order by o), '') from unnest(p_seats) with ordinality t(s, o)
$$;
create function pg_temp.keys(p_json jsonb) returns text language sql as $$
  select string_agg(k, ',' order by k) from jsonb_object_keys(p_json) k
$$;

-- ---------------------------------------------------------------------------
-- T1: a room still playing answers not_finished and nothing else.
-- ---------------------------------------------------------------------------
select pg_temp.game(3, 'a');
select pg_temp.v('a1', 2, 'like'); select pg_temp.v('a2', 2, 'like'); select pg_temp.v('a3', 3, 'nope');

select is(pg_temp.read('a1'), '{"status":"not_finished"}'::jsonb, 'T1 swiping: not_finished and no other key');
update public.rooms set state = 'lobby' where id = tests.room_id();
select is(pg_temp.read('a1'), '{"status":"not_finished"}'::jsonb, 'T1 lobby: not_finished and no other key');
update public.rooms set state = 'dealing' where id = tests.room_id();
select is(pg_temp.read('a1'), '{"status":"not_finished"}'::jsonb, 'T1 dealing: not_finished and no other key');
update public.rooms set state = 'finale' where id = tests.room_id();
select is(pg_temp.read('a1'), '{"status":"not_finished"}'::jsonb, 'T1 finale: not_finished and no other key');

-- A round open in the finale (candidates, a pick not yet made) still says nothing.
insert into public.rounds (room_id, seq, kind, stage, stage_closes_at)
values (tests.room_id(), 1, 'ranked_vote', 'veto', now() + interval '1 minute');
insert into public.round_candidates (round_id, title_id, seed)
select r.id, tests.film(f), f from public.rounds r, generate_series(2, 3) f where r.room_id = tests.room_id();
select is(pg_temp.read('a2'), '{"status":"not_finished"}'::jsonb, 'T1 finale with candidates: not_finished and no title, count or name');

-- Blind and a super like change nothing before the pick.
update public.rooms set reveal = 'blind', state = 'swiping' where id = tests.room_id();
select pg_temp.v('a1', 3, 'super_like');
select is(pg_temp.read('a3'), '{"status":"not_finished"}'::jsonb, 'T1 Blind, swiping: not_finished and no other key');

-- ---------------------------------------------------------------------------
-- T2: Party, a pick from a 3-film round: the 2 other candidates in seed order (not by points), each
-- with its likes and exactly the seats that liked it, in seat order.
-- ---------------------------------------------------------------------------
select pg_temp.game(4, 'b');
select pg_temp.v('b1', 5, 'like'); select pg_temp.v('b2', 5, 'nope'); select pg_temp.v('b3', 5, 'like');
select pg_temp.v('b2', 6, 'super_like'); select pg_temp.v('b4', 6, 'nope');
select pg_temp.v('b1', 4, 'like');
-- Film 6 is seeded before film 5 though film 5 has more points and more likes.
select pg_temp.done(4, 'finale', 'ranked_vote', array[4, 6, 5]);
update public.round_candidates set points = 9 where title_id = tests.film(5);
select is(pg_temp.read('b3')->>'status', 'ok', 'T2 the pick is read');
select is(pg_temp.read('b3')->>'source', 'finalists', 'T2 source is finalists');
select is(pg_temp.read('b3')->>'reveal', 'party', 'T2 reveal is party');
select is(pg_temp.ids(pg_temp.read('b3')), pg_temp.films(array[6, 5]), 'T2 the other candidates in seed order, never points, the pick left out');
select is(pg_temp.likes(pg_temp.read('b3')), '1,2', 'T2 each with its number of likes');
select is(pg_temp.likers(pg_temp.read('b3'), 5), pg_temp.seats('b', array[1, 3]), 'T2 film 5 names exactly the seats that liked it, in seat order');
select is(pg_temp.likers(pg_temp.read('b3'), 6), pg_temp.seats('b', array[2]), 'T2 a super like is named like any like');
select is((select l->>'display_name' || '/' || (l->>'avatar_key' is not null)::text
           from jsonb_array_elements(pg_temp.read('b1')->'runners_up') r, jsonb_array_elements(r->'likers') l
           where (r->>'title_id')::bigint = tests.film(6)),
  (select m.display_name || '/true' from public.room_members m where m.id = tests.member_id('b2')),
  'T2 a liker carries the seat name and avatar');
select is(pg_temp.likers(pg_temp.read('b1'), 5), pg_temp.seats('b', array[1, 3]),
  'T2 the caller own seat is named too (M6.47 default 3)');

-- ---------------------------------------------------------------------------
-- T3: the same in Blind: the same films and likes, no likers key.
-- ---------------------------------------------------------------------------
update public.rooms set reveal = 'blind' where id = tests.room_id();
select is(pg_temp.read('b3')->>'reveal', 'blind', 'T3 reveal is blind');
select is(pg_temp.ids(pg_temp.read('b3')), pg_temp.films(array[6, 5]), 'T3 the same films');
select is(pg_temp.likes(pg_temp.read('b3')), '1,2', 'T3 the same likes');
select is(
  (select count(*) from jsonb_array_elements(pg_temp.read('b3')->'runners_up') r where r ? 'likers'),
  0::bigint, 'T3 no likers key (absent, not empty)');
select is(pg_temp.read('b3')::text !~ 'display_name|avatar_key|member_id', true, 'T3 no name, avatar or seat anywhere in the answer');

-- ---------------------------------------------------------------------------
-- T4: a vetoed candidate is left out.
-- ---------------------------------------------------------------------------
update public.round_candidates set vetoed_at = now() where title_id = tests.film(6);
select is(pg_temp.ids(pg_temp.read('b3')), pg_temp.films(array[5]), 'T4 the vetoed film is not listed');
update public.rooms set reveal = 'party' where id = tests.room_id();
select is(pg_temp.read('b3')::text !~ 'veto', true, 'T4 nothing says a film was vetoed, or by whom');

-- ---------------------------------------------------------------------------
-- T5: a vote between 2 matches: the other match only.
-- ---------------------------------------------------------------------------
select pg_temp.game(3, 'c');
select pg_temp.v('c1', 2, 'like'); select pg_temp.v('c2', 2, 'like'); select pg_temp.v('c3', 2, 'like');
select pg_temp.v('c1', 3, 'like'); select pg_temp.v('c2', 3, 'like');
select pg_temp.done(3, 'finale', 'ranked_vote', array[2, 3]);
select is(pg_temp.ids(pg_temp.read('c1')), pg_temp.films(array[2]), 'T5 the other match only');
select is(pg_temp.read('c1')->>'source', 'finalists', 'T5 source is finalists');
select is(pg_temp.likers(pg_temp.read('c1'), 2), pg_temp.seats('c', array[1, 2, 3]), 'T5 it names its likers');

-- A Final Cut from swipes reads the same way.
select pg_temp.game(2, 'd');
select pg_temp.v('d1', 7, 'like');
select pg_temp.done(8, 'finale', 'final_cut', array[8, 7, 9]);
select is(pg_temp.ids(pg_temp.read('d2')), pg_temp.films(array[7, 9]), 'T5 a Final Cut lists its other candidates in seed order');
select is(pg_temp.likes(pg_temp.read('d2')), '1,0', 'T5 a finalist nobody liked is listed with 0 likes');

-- ---------------------------------------------------------------------------
-- T6: an only_match pick, no round: up to 3 liked films, by likes, then group score, then lowest id.
-- ---------------------------------------------------------------------------
select pg_temp.game(4, 'e');
-- Film 1 is the pick (4 likes). Film 2: 3 likes. Films 3 and 4: 2 likes, 4 has the better score.
-- Film 5: 1 like. Film 6: 3 likes but dropped. Film 7: only nopes. Film 8: no vote.
select pg_temp.v('e1', 1, 'like'); select pg_temp.v('e2', 1, 'like'); select pg_temp.v('e3', 1, 'like'); select pg_temp.v('e4', 1, 'like');
select pg_temp.v('e1', 2, 'like'); select pg_temp.v('e2', 2, 'like'); select pg_temp.v('e3', 2, 'like');
select pg_temp.v('e1', 3, 'like'); select pg_temp.v('e2', 3, 'like');
select pg_temp.v('e1', 4, 'like'); select pg_temp.v('e2', 4, 'like');
select pg_temp.v('e1', 5, 'like');
select pg_temp.v('e1', 6, 'like'); select pg_temp.v('e2', 6, 'like'); select pg_temp.v('e3', 6, 'like');
select pg_temp.v('e1', 7, 'nope'); select pg_temp.v('e2', 7, 'nope');
update public.room_cards set group_score = 1 where room_id = tests.room_id();
update public.room_cards set group_score = 9 where room_id = tests.room_id() and title_id = tests.film(4);
update public.room_cards set state = 'dropped' where room_id = tests.room_id() and title_id = tests.film(6);
select pg_temp.done(1, 'majority');
select is(pg_temp.read('e1')->>'source', 'most_liked', 'T6 source is most_liked');
select is(pg_temp.ids(pg_temp.read('e1')), pg_temp.films(array[2, 4, 3]),
  'T6 3 films: likes, then group score; not the pick, not the dropped film, not a film nobody liked');
select is(pg_temp.likes(pg_temp.read('e1')), '3,2,2', 'T6 with their likes');
select is(pg_temp.likers(pg_temp.read('e1'), 2), pg_temp.seats('e', array[1, 2, 3]), 'T6 Party names the likers');

-- Ties on likes and on group score fall to the lowest film id.
select pg_temp.game(2, 'f');
select pg_temp.v('f1', 9, 'like'); select pg_temp.v('f1', 5, 'like'); select pg_temp.v('f1', 6, 'like'); select pg_temp.v('f1', 8, 'like');
update public.room_cards set group_score = 1 where room_id = tests.room_id();
select pg_temp.done(1, 'unanimous');
select is(pg_temp.ids(pg_temp.read('f2')), pg_temp.films(array[5, 6, 8]), 'T6 equal likes and score: the lowest film id first, 3 at most');

-- A film whose only like came from a removed seat is not listed, a seat that left still counts.
select pg_temp.game(3, 'q');
select pg_temp.v('q1', 2, 'like'); select pg_temp.v('q2', 3, 'like');
update public.room_members set removed_at = now() where id = tests.member_id('q1');
update public.room_members set left_at = now() where id = tests.member_id('q2');
select pg_temp.done(1, 'unanimous');
select is(pg_temp.ids(pg_temp.read('q3')), pg_temp.films(array[3]), 'T6 most liked: a removed seat like does not count, one from a seat that left does');

-- A pick with a match kind and no one else liked: an empty list, still ok.
select pg_temp.game(2, 'g');
select pg_temp.done(1, 'unanimous');
select is(pg_temp.read('g1'), '{"status":"ok","reveal":"party","source":"most_liked","runners_up":[]}'::jsonb,
  'T6 nothing else liked: ok with an empty list');

-- ---------------------------------------------------------------------------
-- T7: only_film, no pick, abandoned and solo answer ok with an empty list.
-- ---------------------------------------------------------------------------
select pg_temp.game(2, 'h');
select pg_temp.v('h1', 2, 'like');
select pg_temp.done(1, 'finale');
select is(pg_temp.read('h1'), '{"status":"ok","reveal":"party","source":null,"runners_up":[]}'::jsonb, 'T7 an only_film pick: ok, no source, empty');

select pg_temp.game(2, 'i', 'blind');
select pg_temp.v('i1', 2, 'like');
update public.rooms set state = 'done', decided_at = null, ended_at = now() where id = tests.room_id();
select is(pg_temp.read('i1'), '{"status":"ok","reveal":"blind","source":null,"runners_up":[]}'::jsonb, 'T7 done with no pick: ok, empty');

select pg_temp.game(2, 'j');
select pg_temp.v('j1', 2, 'like');
update public.rooms set state = 'abandoned', ended_at = now() where id = tests.room_id();
select is(pg_temp.read('j1'), '{"status":"ok","reveal":"party","source":null,"runners_up":[]}'::jsonb, 'T7 abandoned: ok, empty');

select pg_temp.game(2, 'k');
select pg_temp.v('k1', 2, 'like'); select pg_temp.v('k1', 3, 'like');
select pg_temp.done(1, 'unanimous');
update public.rooms set mode = 'solo' where id = tests.room_id();
select is(pg_temp.read('k1'), '{"status":"ok","reveal":"party","source":null,"runners_up":[]}'::jsonb, 'T7 a solo room: ok, empty');

-- ---------------------------------------------------------------------------
-- T8: only a like, a super like and a seen_rewatch count and name.
-- ---------------------------------------------------------------------------
select pg_temp.game(5, 'm');
select pg_temp.v('m1', 2, 'like'); select pg_temp.v('m2', 2, 'super_like'); select pg_temp.v('m3', 2, 'seen_rewatch');
select pg_temp.v('m4', 2, 'nope'); select pg_temp.v('m5', 2, 'seen');
select pg_temp.v('m4', 3, 'seen'); select pg_temp.v('m5', 3, 'nope');
select pg_temp.done(1, 'finale', 'ranked_vote', array[1, 2, 3]);
select is(pg_temp.likes(pg_temp.read('m5')), '3,0', 'T8 a like, a super like and a rewatch count; a nope and a seen do not');
select is(pg_temp.likers(pg_temp.read('m5'), 2), pg_temp.seats('m', array[1, 2, 3]), 'T8 and only those seats are named');
select is(pg_temp.likers(pg_temp.read('m5'), 3), '', 'T8 a film with only nopes and seens names nobody');
select is(pg_temp.read('m5')::text !~ 'super|nope|seen|rewatch', true, 'T8 no mark for super likes, no word about nopes or seens');

-- ---------------------------------------------------------------------------
-- T9: a removed seat is neither counted nor named; a seat that left is both.
-- ---------------------------------------------------------------------------
select pg_temp.game(4, 'n');
select pg_temp.v('n1', 2, 'like'); select pg_temp.v('n2', 2, 'like'); select pg_temp.v('n3', 2, 'like'); select pg_temp.v('n4', 2, 'nope');
select pg_temp.v('n1', 3, 'like');
select pg_temp.done(1, 'finale', 'ranked_vote', array[1, 2, 3]);
update public.room_members set removed_at = now() where id = tests.member_id('n1');
update public.room_members set left_at = now() where id = tests.member_id('n2');
select is(pg_temp.likes(pg_temp.read('n3')), '2,0', 'T9 the removed seat is not counted, the seat that left is');
select is(pg_temp.likers(pg_temp.read('n3'), 2), pg_temp.seats('n', array[2, 3]), 'T9 the removed seat is not named, the seat that left is');
select is(pg_temp.read('n2')->>'status', 'ok', 'T9 a seat that left still reads');
update public.rooms set reveal = 'blind' where id = tests.room_id();
select is(pg_temp.likes(pg_temp.read('n3')), '2,0', 'T9 Blind counts the same');

-- ---------------------------------------------------------------------------
-- T10: the keys are exactly those of the contract, in every shape.
-- ---------------------------------------------------------------------------
select is(pg_temp.keys(pg_temp.read('n3')), 'reveal,runners_up,source,status', 'T10 Blind: top-level keys');
select is((select pg_temp.keys(r) from jsonb_array_elements(pg_temp.read('n3')->'runners_up') r limit 1), 'likes,title_id',
  'T10 Blind: an entry holds title_id and likes only');
update public.rooms set reveal = 'party' where id = tests.room_id();
select is(pg_temp.keys(pg_temp.read('n3')), 'reveal,runners_up,source,status', 'T10 Party: top-level keys');
select is((select pg_temp.keys(r) from jsonb_array_elements(pg_temp.read('n3')->'runners_up') r limit 1), 'likers,likes,title_id',
  'T10 Party: an entry holds title_id, likes and likers only');
select is((select pg_temp.keys(l) from jsonb_array_elements(pg_temp.read('n3')->'runners_up'->0->'likers') l limit 1), 'avatar_key,display_name,member_id',
  'T10 Party: a liker holds member_id, display_name and avatar_key only');
select is(pg_temp.read('n3')::text !~ 'nope|seen_count|not_liked|dislike|of"', true,
  'T10 no nope count, seen count, total or list of seats that did not like');

-- ---------------------------------------------------------------------------
-- T11: who may read.
-- ---------------------------------------------------------------------------
select tests.create_player('stranger');
select tests.authenticate_as('stranger');
select throws_ok(format('select api.room_runners_up(%L)', tests.room_id()), '42501', null, 'T11 a stranger is refused');
select tests.clear_authentication();
select tests.authenticate_as('n1');
select throws_ok(format('select api.room_runners_up(%L)', tests.room_id()), '42501', null, 'T11 a removed seat is refused');
select tests.clear_authentication();
select tests.authenticate_as('n3');
select throws_ok($$select api.room_runners_up(null)$$, '22023', null, 'T11 a null room raises 22023');
select throws_ok($$select api.room_runners_up('00000000-0000-0000-0000-000000000000')$$, '42501', null, 'T11 no such room is refused');
select tests.clear_authentication();
select tests.authenticate_as_anon();
select throws_ok(format('select api.room_runners_up(%L)', tests.room_id()), '42501', null, 'T11 signed out is refused');
select tests.clear_authentication();
-- A stranger is refused before the pick too: not_finished does not leak that a room exists.
select pg_temp.game(2, 'o');
select tests.authenticate_as('stranger');
select throws_ok(format('select api.room_runners_up(%L)', tests.room_id()), '42501', null, 'T11 a stranger is refused while the room is playing');
select tests.clear_authentication();
select is(has_function_privilege('anon', 'api.room_runners_up(uuid)', 'execute'), false, 'T11 anon cannot execute it');
select is(has_function_privilege('authenticated', 'api.room_runners_up(uuid)', 'execute'), true, 'T11 authenticated can');

-- ---------------------------------------------------------------------------
-- T12: reading sends nothing and writes nothing.
-- ---------------------------------------------------------------------------
select pg_temp.game(2, 'p');
select pg_temp.v('p1', 2, 'like');
select pg_temp.done(1, 'finale', 'ranked_vote', array[1, 2]);
select tests.use_topic('room:' || tests.room_id()::text);
create temp table before_read as select
  (select count(*) from realtime.messages) as msgs,
  (select count(*) from public.votes) as votes,
  (select count(*) from public.room_cards) as cards;
select pg_temp.read('p1');
select pg_temp.read('p2');
select tests.use_topic('room:' || tests.room_id()::text);
select is((select count(*) from realtime.messages), (select msgs from before_read), 'T12 a read broadcasts nothing');
select is((select count(*) from public.votes) + (select count(*) from public.room_cards),
          (select votes + cards from before_read), 'T12 a read writes nothing');

select * from finish();
rollback;

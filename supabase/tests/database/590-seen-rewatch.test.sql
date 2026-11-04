-- M6.2: "Seen it" in rooms that allow rewatches (seen_rewatch counts as a like, a plain seen as a
-- nope), no abstentions, the near miss one like short of the rule, and swipe_log.flipped
-- (game-modes.md#the-answers, #when-its-a-match, moments.md#the-near-miss).

begin;
select plan(40);

select tests.create_catalog(40);

-- A fresh swiping room (the last room, for tests.vote) with this seen rule.
create function pg_temp.game(p_players integer, p_prefix text, p_rule public.seen_rule default 'allow_rewatch')
returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix);
  update public.rooms set seen_rule = p_rule where id = tests.room_id();
end $$;

create function pg_temp.chk(p_film integer) returns jsonb language sql as $$
  select internal.check_card_match(tests.room_id(), tests.film(p_film))
$$;

create function pg_temp.near(p_film integer) returns bigint language sql as $$
  select count(*) from tests.broadcasts(tests.room_id(), 'near_miss') n where n->>'title_id' = tests.film(p_film)::text
$$;

create function pg_temp.vote_f(p_name text, p_film integer, p_answer public.vote_answer, p_flipped boolean default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.cast_vote(tests.room_id(), tests.film(p_film), p_answer, p_flipped => p_flipped);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.counts(p_film integer) returns text language sql as $$
  select c.like_count || '/' || c.nope_count || '/' || c.seen_count from public.room_cards c
  where c.room_id = tests.room_id() and c.title_id = tests.film(p_film)
$$;

-- likes_needed.
select is(internal.likes_needed('{"instant_rule":"all_like"}', 3), 3, 'likes_needed: all_like needs every voter');
select is(internal.likes_needed('{"instant_rule":"share_like","share_threshold":0.70}', 5), 4, 'likes_needed: 70% of 5 is 4');
select is(internal.likes_needed('{"instant_rule":"share_like","share_threshold":0.70}', 10), 7, 'likes_needed: 70% of 10 is 7');

-- T1: allow_rewatch, 3 present: like, like, seen_rewatch is a unanimous match.
select pg_temp.game(3, 'a');
select tests.vote('a1', 1); select tests.vote('a2', 1);
select is(tests.vote('a3', 1, 'seen_rewatch')->>'match', 'true', 'T1 like, like, seen_rewatch matches');
select is((select mt.kind::text || '/' || mt.like_count || '/' || mt.present_count from public.matches mt where mt.room_id = tests.room_id()),
  'unanimous/3/3', 'T1 the match is unanimous, 3 of 3');

-- T2: the same with a plain seen makes no match, of 3.
select pg_temp.game(3, 'b');
select tests.vote('b1', 1); select tests.vote('b2', 1);
select is(tests.vote('b3', 1, 'seen')->>'match', 'false', 'T2 like, like, seen makes no match');
select is(pg_temp.chk(1)->>'likes' || '/' || (pg_temp.chk(1)->>'of'), '2/3', 'T2 the check says 2 of 3 (the seen no longer abstains)');

-- T3: show_all, the same two cases.
select pg_temp.game(3, 'c', 'show_all');
select tests.vote('c1', 1); select tests.vote('c2', 1);
select is(tests.vote('c3', 1, 'seen_rewatch')->>'match', 'true', 'T3 show_all: like, like, seen_rewatch matches');
select pg_temp.game(3, 'd', 'show_all');
select tests.vote('d1', 1); select tests.vote('d2', 1);
select is(tests.vote('d3', 1, 'seen')->>'match', 'false', 'T3 show_all: like, like, seen makes no match');

-- T4: 2 players.
select pg_temp.game(2, 'e');
select tests.vote('e1', 1);
select is(tests.vote('e2', 1, 'seen_rewatch')->>'match', 'true', 'T4 2 players: like plus seen_rewatch matches');
select pg_temp.game(2, 'f');
select tests.vote('f1', 1);
select is(tests.vote('f2', 1, 'seen')->>'match', 'false', 'T4 2 players: like plus seen does not match');

-- T5: 5 present, 70%.
select pg_temp.game(5, 'g');
select tests.vote('g1', 1); select tests.vote('g2', 1);
select is(tests.vote('g3', 1)->>'match', 'false', 'T5 3 likes of 5 are no match yet (4 needed)');
select is(tests.vote('g4', 1, 'seen_rewatch')->>'match', 'true', 'T5 3 likes and a seen_rewatch match');
select is((select mt.kind::text || '/' || mt.like_count || '/' || mt.present_count from public.matches mt where mt.room_id = tests.room_id()),
  'majority/4/5', 'T5 a majority match, 4 of 5');
select pg_temp.game(5, 'h');
select tests.vote('h1', 1); select tests.vote('h2', 1); select tests.vote('h3', 1);
select tests.vote('h4', 1, 'seen'); select tests.vote('h5', 1, 'nope');
select is((select count(*) from public.matches where room_id = tests.room_id()), 0::bigint, 'T5 3 likes, a seen and a nope are no match');

-- T6: a player who said plain seen leaves; the two still present liked it.
select pg_temp.game(3, 'i');
select tests.vote('i1', 1); select tests.vote('i2', 1); select tests.vote('i3', 1, 'seen');
select is((select count(*) from public.matches where room_id = tests.room_id()), 0::bigint, 'T6 positive control: no match while the third is here');
select tests.authenticate_as('i3');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is((select mt.like_count || '/' || mt.present_count from public.matches mt where mt.room_id = tests.room_id()),
  '2/2', 'T6 the re-check after the leave makes it a match of 2');

-- T7: hide_seen.
select pg_temp.game(3, 'j', 'hide_seen');
select tests.authenticate_as('j1');
select throws_ok(
  format('select api.cast_vote(%L, %L, ''seen_rewatch'')', tests.room_id(), tests.film(1)),
  '22023', null, 'T7 seen_rewatch in a hide_seen room raises 22023');
select tests.clear_authentication();
select is((select count(*) from public.votes where room_id = tests.room_id()) + (select count(*) from public.swipe_log where room_id = tests.room_id()),
  0::bigint, 'T7 nothing is saved');
select tests.vote('j1', 2, 'seen');
select is((select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(2)),
  'dropped', 'T7 a plain seen still drops the film');

-- T8: counters by meaning. T9: the seen mark.
select pg_temp.game(3, 'k');
select tests.vote('k1', 1, 'seen_rewatch');
select is(pg_temp.counts(1), '1/0/1', 'T8 seen_rewatch adds a like and a seen');
select tests.vote('k2', 2, 'seen');
select is(pg_temp.counts(2), '0/1/1', 'T8 a plain seen under allow_rewatch adds a nope and a seen');
select pg_temp.game(3, 'l', 'hide_seen');
select tests.vote('l1', 3, 'seen');
select is(pg_temp.counts(3), '0/0/1', 'T8 under hide_seen only seen_count moves');
select is((select ut.source::text || '/' || ut.seen from public.user_titles ut
           where ut.profile_id = tests.uid('k1') and ut.title_id = tests.film(1)),
  'app/true', 'T9 seen_rewatch saves the seen mark');

-- T10: the first seen_rewatch propagates.
select tests.deal_game(2, 'q');
update public.rooms set seen_rule = 'allow_rewatch' where id = tests.room_id();
select tests.vote_next('q2', 15);
select tests.vote_next('q1', 10);
select tests.vote('q1', 11, 'seen_rewatch');
select is((tests.upcoming('q2'))[4], tests.film(11), 'T10 film 11 moves into q2''s next cards');
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'deck_updated') d
   where (d->'member_ids') ? tests.member_id('q2')::text and not ((d->'member_ids') ? tests.member_id('q1')::text)),
  1::bigint, 'T10 a deck_updated tells q2');

-- T11: near miss, 3 present, Party.
select pg_temp.game(3, 'm');
select tests.vote('m1', 1);
select is(pg_temp.near(1), 0::bigint, 'T11 one like sends no near_miss');
select tests.vote('m2', 1);
select is((select n->>'likes' || '/' || (n->>'of') || '/' || (n->>'needed') from tests.broadcasts(tests.room_id(), 'near_miss') n),
  '2/3/3', 'T11 the second like sends one near_miss: 2 likes, of 3, needed 3');

-- T12: 5 present, needs 4.
select pg_temp.game(5, 'n');
select tests.vote('n1', 1); select tests.vote('n2', 1);
select is(pg_temp.near(1), 0::bigint, 'T12 2 likes of 5 send nothing (3 would be one short)');
select tests.vote('n3', 1);
select is(pg_temp.near(1), 1::bigint, 'T12 the third like sends one near_miss');
select is((select n->>'likes' || '/' || (n->>'of') || '/' || (n->>'needed') from tests.broadcasts(tests.room_id(), 'near_miss') n),
  '3/5/4', 'T12 it says 3 likes, of 5, needed 4');

-- T13: nobody left to answer.
select pg_temp.game(3, 'o');
select tests.vote('o1', 1); select tests.vote('o2', 1, 'nope'); select tests.vote('o3', 1);
select is(pg_temp.near(1), 0::bigint, 'T13 like, nope, like sends nothing: nobody can still answer');

-- T14: Blind mode.
select pg_temp.game(3, 'r');
update public.rooms set reveal = 'blind' where id = tests.room_id();
select tests.vote('r1', 1); select tests.vote('r2', 1);
select is(pg_temp.near(1), 0::bigint, 'T14 Blind mode sends no near_miss');

-- T15: flipped.
select pg_temp.game(3, 's');
select pg_temp.vote_f('s1', 1, 'like', true);
select pg_temp.vote_f('s1', 2, 'nope', false);
select tests.vote('s1', 3);
select is((select sl.flipped from public.swipe_log sl where sl.room_member_id = tests.member_id('s1') and sl.title_id = tests.film(1)), true, 'T15 flipped true is saved');
select is((select sl.flipped from public.swipe_log sl where sl.room_member_id = tests.member_id('s1') and sl.title_id = tests.film(2)), false, 'T15 flipped false is saved');
select is((select sl.flipped from public.swipe_log sl where sl.room_member_id = tests.member_id('s1') and sl.title_id = tests.film(3)), null, 'T15 a call without it saves null');
select is(pg_temp.vote_f('s1', 3, 'like', true)->>'status', 'duplicate', 'T15 a duplicate answers duplicate');
select is((select sl.flipped from public.swipe_log sl where sl.room_member_id = tests.member_id('s1') and sl.title_id = tests.film(3)), null, 'T15 a duplicate changes nothing');

-- T16: a retried seen_rewatch.
select pg_temp.game(3, 't');
select tests.vote('t1', 1, 'seen_rewatch');
select is(tests.vote('t1', 1, 'seen_rewatch')->>'status', 'duplicate', 'T16 the retry answers duplicate');
select is(pg_temp.counts(1), '1/0/1', 'T16 no counter moved');

select * from finish();
rollback;

-- M6.30: a seat silent for 90 seconds stops being present, but it only stops being a voter after
-- 3 minutes; the minute sweeper then re-checks liked films once per silence
-- (game-modes.md#who-counts-presence-joining-and-leaving, #internalsweep_rooms).
-- Seats are aged by hand with last_active_at. now() is fixed inside a test, so a seat that "came
-- back and went silent again" is set up with an older silence_checked_at.

begin;
select plan(24);

select tests.create_catalog(25);
select tests.use_deck_engine('sql');

create function pg_temp.silent(p_name text, p_interval interval) returns void language sql as $$
  update public.room_members set last_active_at = now() - p_interval where id = tests.member_id(p_name)
$$;

create function pg_temp.sweep() returns text language sql as $$ select internal.sweep_room(tests.room_id()) $$;

create function pg_temp.state() returns text language sql as $$
  select r.state::text from public.rooms r where r.id = tests.room_id()
$$;

create function pg_temp.broadcast_count(p_event text) returns bigint language sql as $$
  select count(*) from tests.broadcasts(tests.room_id(), p_event)
$$;

create function pg_temp.checked(p_name text) returns boolean language sql as $$
  select silence_checked_at is not null from public.room_members where id = tests.member_id(p_name)
$$;

-- A swiping game whose seats joined before the start and swipe on a long clock.
create function pg_temp.game(p_players integer, p_prefix text) returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping');
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds', expires_at = now() + interval '50 minutes'
  where id = tests.room_id();
end
$$;

-- voter_member_ids: not left, heard from in the last 3 minutes.
select pg_temp.game(4, 'v');
select pg_temp.silent('v2', interval '91 seconds');
select pg_temp.silent('v3', interval '3 minutes 1 second');
update public.room_members set left_at = now() where id = tests.member_id('v4');
select is(cardinality(internal.voter_member_ids(tests.room_id())), 2,
  'voters: heard from within 3 minutes and not left (91 s counts, 3 min 1 s and left do not)');
select ok(tests.member_id('v2') = any (internal.voter_member_ids(tests.room_id())), 'voters: a seat silent for 91 seconds is still a voter');
select ok(not (tests.member_id('v2') = any (internal.present_member_ids(tests.room_id()))), 'voters: the same seat is no longer present');

-- 1. 3 seats, one silent for 2 minutes: the other two liking is not a match.
select pg_temp.game(3, 'a');
select pg_temp.silent('a3', interval '2 minutes');
select tests.vote('a1', 1);
select is(tests.vote('a2', 1)->>'match', 'false', 'T1 a seat silent for 2 minutes still counts: 2 of 3 is no match');
select is(internal.check_card_match(tests.room_id(), tests.film(1))->>'of', '3', 'T1 the check says 2 likes of 3 voters');

-- 2. The same seat silent for 3 min 1 s: the other two are a unanimous match of 2.
select pg_temp.game(3, 'b');
select pg_temp.silent('b3', interval '3 minutes 1 second');
select tests.vote('b1', 1);
select is(tests.vote('b2', 1)->>'match', 'true', 'T2 a seat silent for 3 min 1 s stops counting: a match');
select is((select mt.kind::text || '/' || mt.like_count || '/' || mt.present_count from public.matches mt where mt.room_id = tests.room_id()),
  'unanimous/2/2', 'T2 it is unanimous, 2 of 2');
select is(pg_temp.state(), 'done', 'T2 a quick match decides the room');
select is(pg_temp.broadcast_count('match'), 1::bigint, 'T2 the match is sent');
select is(pg_temp.broadcast_count('state_changed') >= 1 and exists (
  select 1 from tests.broadcasts(tests.room_id(), 'state_changed') s where s->>'state' = 'done'), true,
  'T2 a match that ends the room also sends state_changed done');

-- 2b. Two seats, one silent for 3 min 1 s: one voter is no match.
select pg_temp.game(2, 'c');
select pg_temp.silent('c2', interval '3 minutes 1 second');
select is(tests.vote('c1', 1)->>'match', 'false', 'T2 two seats, one gone: one voter, no match');

-- 3. Silent for 91 seconds: not present, still a voter. Four seats need all four to like.
select pg_temp.game(4, 'g');
select pg_temp.silent('g4', interval '91 seconds');
select tests.vote('g1', 1); select tests.vote('g2', 1);
select is(tests.vote('g3', 1)->>'match', 'false', 'T3 3 likes of 4 voters is no match (3 of 3 present would have been)');
select is(cardinality(internal.present_member_ids(tests.room_id())), 3, 'T3 presence is unchanged: the silent seat is not present');

-- 3b. Five seats, 70% of 5 is 4 likes.
select pg_temp.game(5, 'd');
select pg_temp.silent('d5', interval '91 seconds');
select tests.vote('d1', 1); select tests.vote('d2', 1);
select is(tests.vote('d3', 1)->>'match', 'false', 'T3b 3 likes of 5 voters is no match (3 of 4 present would have been 70%)');
select is(cardinality(internal.present_member_ids(tests.room_id())), 4, 'T3b presence is unchanged: 4 present');

-- 6. The near miss uses the voters: 3 likes, of 5, needed 4, and a present seat is left to answer.
select is((select n->>'likes' || '/' || (n->>'of') || '/' || (n->>'needed') from tests.broadcasts(tests.room_id(), 'near_miss') n),
  '3/5/4', 'T6 the near miss says of 5 and needed 4 (voters)');

-- 4. The sweeper re-checks a seat silent for 3 minutes, once.
select pg_temp.game(3, 'e');
select tests.vote('e1', 1); select tests.vote('e2', 1);
select is(pg_temp.state(), 'swiping', 'T4 two likes of 3 voters: still swiping');
select pg_temp.silent('e3', interval '3 minutes 1 second');
select is(pg_temp.sweep(), 'rechecked', 'T4 the sweeper re-checks the liked films');
select is(pg_temp.state(), 'done', 'T4 the match decided the room');
select is(pg_temp.broadcast_count('match'), 1::bigint, 'T4 the match is sent');
select ok(pg_temp.checked('e3'), 'T4 silence_checked_at is set on the silent seat');

-- 5. No match to find: checked once, then left alone until the seat comes back and goes silent again.
select pg_temp.game(4, 'f');
select tests.vote('f1', 1);
select pg_temp.silent('f4', interval '3 minutes 1 second');
select is(pg_temp.sweep(), 'rechecked', 'T5 a silent seat not yet re-checked is re-checked');
select is(pg_temp.sweep(), 'nothing', 'T5 the next run does nothing');
update public.room_members set last_active_at = now() - interval '4 minutes', silence_checked_at = now() - interval '5 minutes'
where id = tests.member_id('f4');
select is(pg_temp.sweep(), 'rechecked', 'T5 a seat that came back and went silent again is re-checked again');

select * from finish();
rollback;

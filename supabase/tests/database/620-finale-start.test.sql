-- M6.4: starting the finale (game-modes.md#when-it-starts, #who-counts, #the-finalists,
-- #time-to-a-pick). The card count counts seats seated at the start and present; the time limit
-- counts everyone; finalists need a like; one liked film is the pick; nothing liked is no pick.

begin;
select plan(42);

select tests.create_catalog(40);

-- A swiping game whose seats all joined before the start, started 100 seconds ago.
create function pg_temp.game(p_players integer, p_prefix text, p_mode text default 'quick_match')
returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping', p_mode);
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds' where id = tests.room_id();
end
$$;

create function pg_temp.swipes(p_name text, p_count integer) returns void language sql as $$
  update public.room_members set swipe_count = p_count where id = tests.member_id(p_name)
$$;

create function pg_temp.late(p_secs integer) returns void language sql as $$
  update public.rooms set started_at = now() - make_interval(secs => p_secs) where id = tests.room_id()
$$;

create function pg_temp.round_titles() returns text language sql as $$
  select string_agg(rc.title_id::text, ',' order by rc.seed)
  from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
  where ro.room_id = tests.room_id()
$$;

create function pg_temp.round_info() returns text language sql as $$
  select ro.kind::text || '/' || ro.stage::text || '/' || (abs(extract(epoch from ro.stage_closes_at - now()) - 60) < 1)::text
  from public.rounds ro where ro.room_id = tests.room_id()
$$;

-- 1. The card count: 40 and 39 swipes, the 39th seat answers once more.
select pg_temp.game(2, 'a');
select tests.vote('a1', 1, 'like');
select pg_temp.swipes('a1', 40);
select pg_temp.swipes('a2', 37);
select is(
  (select tests.vote('a2', 2, 'nope') ? 'finale_round_id'),
  false,
  'M6.4 positive control: seats at 40 and 38 start no finale'
);
select is(
  (select tests.vote('a2', 3, 'nope') ? 'finale_round_id'),
  false,
  'M6.4 positive control: seats at 40 and 39 start no finale'
);
create temp table v_a as select tests.vote('a2', 4, 'nope') as a;
select is(
  (select a ? 'finale_round_id' from v_a) || '/' || (select r.state::text || '/' || r.finale_reason::text from public.rooms r where r.id = tests.room_id()),
  'true/finale/cards',
  'M6.4 the card count: both seats at 40 open the finale with reason cards'
);

-- 2. A late joiner does not count towards the card count.
select pg_temp.game(3, 'b');
update public.room_members set joined_at = now() where id = tests.member_id('b3');
select tests.vote('b1', 1, 'like');
select pg_temp.swipes('b1', 40);
select pg_temp.swipes('b2', 38);
select tests.vote('b2', 2, 'nope');
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id()),
  'swiping',
  'M6.4 positive control: the original seats at 40 and 39 start no finale'
);
select is(
  (select (tests.vote('b2', 3, 'nope') ? 'finale_round_id')),
  true,
  'M6.4 a late joiner with 0 swipes does not hold up the card count'
);

-- 3. A seat silent for over 90 seconds does not hold it up either.
select pg_temp.game(3, 'c');
select tests.vote('c1', 1, 'like');
select pg_temp.swipes('c1', 40);
select pg_temp.swipes('c2', 38);
update public.room_members set last_active_at = now() - interval '120 seconds' where id = tests.member_id('c3');
select tests.vote('c2', 2, 'nope');
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id()),
  'swiping',
  'M6.4 positive control: seats at 40 and 39 start no finale'
);
select is(
  (select (tests.vote('c2', 3, 'nope') ? 'finale_round_id')),
  true,
  'M6.4 a seated seat silent for 90 seconds does not hold up the card count'
);

-- 3b. With every seat joined after the start, the card count cannot fire.
select pg_temp.game(2, 'd');
select tests.vote('d1', 1, 'like');
select pg_temp.swipes('d1', 40);
select pg_temp.swipes('d2', 40);
update public.room_members set joined_at = now() where room_id = tests.room_id();
select is(
  (select (tests.vote('d1', 2, 'nope') ? 'finale_round_id')),
  false,
  'M6.4 with every seat joined after the start, the card count cannot fire'
);

-- 4, 5. The time limit for 2, 3 and 5 players, kinds, and the 60 second round.
select pg_temp.game(2, 'e');
select tests.vote('e1', 1, 'like');
select pg_temp.late(359);
select is((select tests.vote('e1', 2, 'nope') ? 'finale_round_id'), false, 'M6.4 positive control: 359 seconds, 2 players, no finale');
select pg_temp.late(361);
create temp table v_e as select tests.vote('e1', 3, 'nope') as a;
select is(
  (select a ? 'finale_round_id' from v_e) || '/' || (select r.finale_reason::text from public.rooms r where r.id = tests.room_id()),
  'true/time',
  'M6.4 361 seconds, 2 players: the finale opens with reason time'
);
select is(pg_temp.round_info(), 'final_cut/vote/true', 'M6.4 2 players: a final_cut round in stage vote closing in 60 seconds');
select is(
  (select count(*) from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id where ro.room_id = tests.room_id()),
  3::bigint,
  'M6.4 2 players: 3 candidates'
);

select pg_temp.game(3, 'f');
select tests.vote('f1', 1, 'like');
select pg_temp.late(359);
select is((select tests.vote('f1', 2, 'nope') ? 'finale_round_id'), false, 'M6.4 positive control: 359 seconds, 3 players, no finale');
select pg_temp.late(361);
create temp table v_f as select tests.vote('f1', 3, 'nope') as a;
select is(
  (select a ? 'finale_round_id' from v_f) || '/' || (select r.finale_reason::text from public.rooms r where r.id = tests.room_id()),
  'true/time',
  'M6.4 361 seconds, 3 players: the finale opens with reason time'
);
select is(pg_temp.round_info(), 'final_cut/vote/true', 'M6.4 3 players: a final_cut round in stage vote closing in 60 seconds');
select is(
  (select count(*) from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id where ro.room_id = tests.room_id()),
  4::bigint,
  'M6.4 3 players: 4 candidates'
);

select pg_temp.game(5, 'g');
select tests.vote('g1', 1, 'like');
select pg_temp.late(359);
select is((select tests.vote('g1', 2, 'nope') ? 'finale_round_id'), false, 'M6.4 positive control: 359 seconds, 5 players, no finale');
select pg_temp.late(361);
create temp table v_g as select tests.vote('g1', 3, 'nope') as a;
select is(
  (select a ? 'finale_round_id' from v_g) || '/' || (select r.finale_reason::text from public.rooms r where r.id = tests.room_id()),
  'true/time',
  'M6.4 361 seconds, 5 players: the finale opens with reason time'
);
select is(pg_temp.round_info(), 'ranked_vote/vote/true', 'M6.4 5 players: a ranked_vote round in stage vote closing in 60 seconds');

-- 5b. Both reasons at once is cards.
select pg_temp.game(2, 'h');
select tests.vote('h1', 1, 'like');
select pg_temp.swipes('h1', 40);
select pg_temp.swipes('h2', 39);
select pg_temp.late(400);
select tests.vote('h2', 2, 'nope');
select is((select r.finale_reason::text from public.rooms r where r.id = tests.room_id()), 'cards',
  'M6.4 when the card count and the time limit hold together the reason is cards');

-- 7. Order: matched, then score (super like 2, nope -1), then group score, then lowest id.
select pg_temp.game(3, 'j', 'final_cut');
update public.room_cards set group_score = 0, like_count = 0, super_like_count = 0, nope_count = 0
  where room_id = tests.room_id();
update public.room_cards set state = 'matched', like_count = 2 where room_id = tests.room_id() and title_id = tests.film(1);
update public.room_cards set like_count = 2, nope_count = 1, group_score = 5 where room_id = tests.room_id() and title_id = tests.film(2);
update public.room_cards set super_like_count = 1 where room_id = tests.room_id() and title_id = tests.film(3);
update public.room_cards set like_count = 1, group_score = 9 where room_id = tests.room_id() and title_id = tests.film(4);
update public.room_cards set like_count = 1, group_score = 5 where room_id = tests.room_id() and title_id = tests.film(5);
select pg_temp.late(361);
select tests.vote('j1', 20, 'nope');
select is(
  pg_temp.round_titles(),
  concat_ws(',', tests.film(1), tests.film(3), tests.film(4), tests.film(2)),
  'M6.4 order: matched first, then score (super like 2, nope 1 off), then group score, then lowest id'
);
select is(
  (select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(1))
  || '/' || (select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(3)),
  'matched/finalist',
  'M6.4 active finalists become finalist, the matched card stays matched'
);

-- 8. One like and one nope still qualifies.
select pg_temp.game(2, 'k');
select tests.vote('k1', 1, 'like');
select tests.vote('k2', 1, 'nope');
update public.room_cards set group_score = 50 where room_id = tests.room_id() and title_id in (tests.film(2), tests.film(3));
select pg_temp.late(361);
select tests.vote('k1', 4, 'nope');
select is(
  (select split_part(pg_temp.round_titles(), ',', 1)),
  tests.film(1)::text,
  'M6.4 a film with 1 like and 1 nope qualifies and comes first'
);

-- 9, 10. The fill: by group score, never a noped or dropped film, never a film everyone noped.
select pg_temp.game(3, 'l');
update public.room_cards set group_score = 0 where room_id = tests.room_id();
update public.room_cards set group_score = 9 where room_id = tests.room_id() and title_id = tests.film(10);
update public.room_cards set group_score = 8 where room_id = tests.room_id() and title_id = tests.film(11);
update public.room_cards set group_score = 7 where room_id = tests.room_id() and title_id = tests.film(12);
update public.room_cards set group_score = 99, nope_count = 1 where room_id = tests.room_id() and title_id = tests.film(5);
update public.room_cards set group_score = 98, state = 'dropped' where room_id = tests.room_id() and title_id = tests.film(6);
select tests.vote('l1', 1, 'like');
select tests.vote('l1', 7, 'nope');
select tests.vote('l2', 7, 'nope');
select tests.vote('l3', 7, 'nope');
update public.room_cards set group_score = 97 where room_id = tests.room_id() and title_id = tests.film(7);
select pg_temp.late(361);
select tests.vote('l2', 25, 'nope');
select is(
  pg_temp.round_titles(),
  concat_ws(',', tests.film(1), tests.film(10), tests.film(11), tests.film(12)),
  'M6.4 the list is filled by group score, never with a noped film or a dropped one'
);
select is(
  (select count(*) from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
   where ro.room_id = tests.room_id() and rc.title_id in (tests.film(5), tests.film(6), tests.film(7), tests.film(25))),
  0::bigint,
  'M6.4 a film everyone noped, a noped one and a dropped one are never finalists'
);

-- 11. One liked film and no unnoped film: it is the pick, no vote.
select pg_temp.game(2, 'm');
update public.room_cards set nope_count = 1 where room_id = tests.room_id() and title_id <> tests.film(1);
select tests.vote('m1', 1, 'like');
select pg_temp.late(361);
create temp table one_film as select tests.vote('m1', 2, 'nope') as a;
select is(
  (select count(*) from public.rounds where room_id = tests.room_id()),
  0::bigint,
  'M6.4 one qualifying film: no round'
);
select is(
  (select mt.kind::text || '/' || mt.pick_order || '/' || mt.like_count || '/' || mt.present_count
   from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(1)),
  'finale/1/1/2',
  'M6.4 one qualifying film: a finale match with pick_order 1'
);
select is(
  (select r.state::text || '/' || (r.decided_at is not null) || '/' || (r.ended_at is not null) || '/' || (r.finale_at is not null) || '/' || r.finale_reason::text
   from public.rooms r where r.id = tests.room_id()),
  'done/true/true/true/time',
  'M6.4 one qualifying film: the room is done with its dates and reason'
);
select is(
  (select (m ->> 'title_id') || '/' || (m ->> 'kind') || '/' || (m ->> 'decided') || '/' || (m ->> 'reason') || '/' || (m ->> 'likes') || '/' || (m ->> 'of') || '/' || (m -> 'finalists')::text
   from tests.broadcasts(tests.room_id(), 'match') m),
  tests.film(1) || '/finale/true/only_film/1/2/[]',
  'M6.4 one qualifying film: a match event with reason only_film'
);
select is(
  (select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(1))
  || '/' || (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s ->> 'state' = 'done'),
  'matched/1',
  'M6.4 one qualifying film: the card is matched and state_changed done follows'
);
select is((select (a ? 'finale_round_id') from one_film), false, 'M6.4 one qualifying film: the vote answers no round');

-- 12. Nothing liked: no pick, at the card count and at the time limit.
select pg_temp.game(2, 'n');
select pg_temp.swipes('n1', 40);
select pg_temp.swipes('n2', 39);
select tests.vote('n2', 2, 'nope');
select is(
  (select r.state::text || '/' || r.finale_reason::text || '/' || (r.decided_at is null) || '/' || (r.ended_at is not null)
   from public.rooms r where r.id = tests.room_id()),
  'done/cards/true/true',
  'M6.4 nothing liked at the card count: the room is done with no pick'
);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()) + (select count(*) from public.rounds where room_id = tests.room_id()),
  0::bigint,
  'M6.4 no pick: no matches row and no round'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s ->> 'state' = 'done' and s ->> 'outcome' = 'no_pick'),
  1::bigint,
  'M6.4 no pick: state_changed done with outcome no_pick'
);
select pg_temp.game(2, 'o');
select pg_temp.late(361);
select tests.vote('o1', 1, 'nope');
select is(
  (select r.state::text || '/' || r.finale_reason::text from public.rooms r where r.id = tests.room_id()),
  'done/time',
  'M6.4 nothing liked at the time limit: done with no pick, reason time'
);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()) + (select count(*) from public.rounds where room_id = tests.room_id()),
  0::bigint,
  'M6.4 no pick at the time limit: no matches row and no round'
);

-- 13. A round opens with exactly one finale_started and one state_changed finale.
select pg_temp.game(2, 'p');
select tests.vote('p1', 1, 'like');
select pg_temp.late(361);
create temp table opened as select tests.vote('p2', 2, 'nope') as a;
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'finale_started')) || '/'
  || (select count(*) from tests.broadcasts(tests.room_id(), 'state_changed') s where s ->> 'state' = 'finale'),
  '1/1',
  'M6.4 a round opens with one finale_started and one state_changed finale'
);
select is(
  (select (f ->> 'round_id') from tests.broadcasts(tests.room_id(), 'finale_started') f),
  (select a ->> 'finale_round_id' from opened),
  'M6.4 the vote that opened the round answers its id'
);

-- 15. Votes during the finale answer closed.
select is(
  (select tests.vote('p1', 3, 'nope')),
  jsonb_build_object('status', 'closed', 'state', 'finale'),
  'M6.4 a vote during the finale answers closed with state finale'
);

-- 14. A vote that ends the room asks for no cards.
select pg_temp.game(2, 'q');
select pg_temp.swipes('q1', 40);
select pg_temp.swipes('q2', 37);
delete from public.deck_entries d
  where d.room_member_id = tests.member_id('q2')
    and d.title_id not in (tests.film(1), tests.film(2), tests.film(3), tests.film(4), tests.film(5));
select tests.vote('q2', 2, 'nope');
select is(
  (select count(*) from tests.queued('deck_requests') q where (q ->> 'room_id')::uuid = tests.room_id() and q ->> 'kind' = 'refill'),
  1::bigint,
  'M6.4 positive control: a vote that leaves the game running asks for cards'
);
update public.room_members set refill_requested_at = null where id = tests.member_id('q2');
select tests.vote('q2', 3, 'nope');
update public.room_members set refill_requested_at = null where id = tests.member_id('q2');
select tests.vote('q2', 4, 'nope');
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id()) || '/'
  || (select count(*) from tests.queued('deck_requests') q where (q ->> 'room_id')::uuid = tests.room_id() and q ->> 'kind' = 'refill'),
  'done/2',
  'M6.4 the vote that ended the room (nothing liked) asks for no cards (only the votes before it did)'
);
select pg_temp.game(2, 'r');
select tests.use_deck_engine('sql');
select tests.vote('r1', 1, 'nope');
select pg_temp.swipes('r1', 40);
select pg_temp.swipes('r2', 39);
delete from public.deck_entries d
  where d.room_member_id = tests.member_id('r2') and d.title_id not in (tests.film(1), tests.film(2), tests.film(3));
create temp table r_before as select count(*) as n from public.deck_entries where room_id = tests.room_id();
select tests.vote('r2', 2, 'nope');
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id()) || '/' || (select count(*) from public.deck_entries where room_id = tests.room_id()),
  'done/' || (select n from r_before),
  'M6.4 a vote that ends the room deals no new cards'
);

select * from finish();
rollback;

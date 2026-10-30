-- Matches, leaving and the finale's seeding (game-modes.md#when-its-a-match and
-- #the-finalists, data-model.md#what-was-tested, "Game rules"). G1b, G1c, G4b, G6b,
-- G8c and G9b are beyond the 120 checks of data-model.md#what-was-tested.
--
-- No card count, time limit or finale size is written here: the rules are read from
-- rooms.rule, which M6.1 changes. G6 checks only that the finale opens, its kind and
-- the first three seeds, because M6.4 reshapes the rest.

begin;
select plan(56);

select tests.create_catalog(40);

-- G1, G2, G1b, G1c: a unanimous match ends Quick Match (3 players, Party mode).
select tests.deal_game(3, 'p');

select tests.vote('p1', 1);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'near_miss')),
  0::bigint,
  'G1c one like is not a near miss (beyond the 120)'
);
select is(
  (select count(*) from tests.queued('room_finished') q where (q->>'room_id')::uuid = tests.room_id()),
  0::bigint,
  'G2 no room_finished message is queued before the match'
);
select tests.vote('p2', 1);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'near_miss')),
  1::bigint,
  'G1c two likes without a match send one near_miss (beyond the 120)'
);
select is(
  (select n->>'title_id' || '/' || (n->>'likes') || '/' || (n->>'of')
   from tests.broadcasts(tests.room_id(), 'near_miss') n),
  tests.film(1)::text || '/2/3',
  'G1c the near_miss carries the film, 2 likes and 3 players (beyond the 120)'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'near_miss') n, jsonb_object_keys(n) k
   where k not in ('title_id', 'likes', 'of', 'id')),
  0::bigint,
  'G1c the near_miss names no seat and no player: only title_id, likes and of (beyond the 120)'
);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()),
  0::bigint,
  'G1 positive control: no match row before the third like'
);

create temp table g1_answer as select tests.vote('p3', 1) as a;
select is(
  (select a->>'status' || '/' || (a->>'match') || '/' || (a->>'kind') || '/' || (a->>'decided') from g1_answer),
  'ok/true/unanimous/true',
  'G1 the third like answers a unanimous, deciding match'
);
select is(
  (select mt.title_id = tests.film(1) and mt.kind = 'unanimous' and mt.like_count = 3
          and mt.present_count = 3 and mt.pick_order = 1
   from public.matches mt where mt.room_id = tests.room_id()),
  true,
  'G1 one matches row: film 1, unanimous, 3 likes of 3 present, pick order 1'
);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()),
  1::bigint,
  'G1 there is exactly one matches row'
);
select is(
  (select r.state::text || '/' || (r.decided_at is not null) || '/' || (r.ended_at is not null)
   from public.rooms r where r.id = tests.room_id()),
  'done/true/true',
  'G1 the room is done, with decided_at and ended_at set'
);
select is(
  (select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(1)),
  'matched',
  'G1 the card of film 1 is matched'
);
select is(
  (select m->>'title_id' || '/' || (m->>'kind') || '/' || (m->>'likes') || '/' || (m->>'of') || '/' || (m->>'decided')
   from tests.broadcasts(tests.room_id(), 'match') m),
  tests.film(1)::text || '/unanimous/3/3/true',
  'G1 one match broadcast carries the film, unanimous, 3 likes of 3, decided'
);
select is(
  (select count(*) from tests.queued('room_finished') q where (q->>'room_id')::uuid = tests.room_id()),
  1::bigint,
  'G2 exactly one room_finished message is queued for the room'
);

select is(
  (select a->>'status' || '/' || (a->>'state') from (select tests.vote('p1', 2, 'nope') a) x),
  'closed/done',
  'G1b a vote after the match answers closed with the room state (beyond the 120)'
);
select is(
  (select count(*) from public.votes v where v.room_member_id = tests.member_id('p1') and v.title_id = tests.film(2)),
  0::bigint,
  'G1b the vote after the match is not saved (beyond the 120)'
);

-- G9, G9b: 4 likes out of 5 is a majority match (Blind mode).
select tests.deal_game(5, 'm');
update public.rooms set reveal = 'blind' where id = tests.room_id();

select tests.vote('m5', 1, 'nope');
select tests.vote('m1', 1);
select tests.vote('m2', 1);
create temp table g9_third as select tests.vote('m3', 1) as a;
select is(
  (select a->>'status' || '/' || (a->>'match') from g9_third),
  'ok/false',
  'G9 three likes out of 5 are not a match'
);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()),
  0::bigint,
  'G9 positive control: no matches row after three likes'
);
create temp table g9_fourth as select tests.vote('m4', 1) as a;
select is(
  (select a->>'status' || '/' || (a->>'match') || '/' || (a->>'kind') || '/' || (a->>'decided') from g9_fourth),
  'ok/true/majority/true',
  'G9 the fourth like out of 5 answers a majority, deciding match'
);
select is(
  (select mt.like_count || '/' || mt.present_count || '/' || mt.kind::text
   from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(1)),
  '4/5/majority',
  'G9 the matches row has 4 likes, 5 present and kind majority'
);
select is((select r.state::text from public.rooms r where r.id = tests.room_id()), 'done', 'G9 the room is done');
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'near_miss')),
  0::bigint,
  'G9b Blind mode sends no near_miss although 3 players liked film 1 without a match (beyond the 120)'
);
select is(
  (select r.reveal::text from public.rooms r where r.id = tests.room_id()),
  'blind',
  'G9b positive control: the room really is in Blind mode (beyond the 120)'
);

-- G4: a player leaving completes a match.
select tests.deal_game(3, 'r');
select tests.vote('r1', 1);
select tests.vote('r2', 1);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()),
  0::bigint,
  'G4 positive control: two likes of 3 players are no match while all three are here'
);
select tests.authenticate_as('r3');
create temp table g4_leave as select api.leave_room(tests.room_id()) as a;
select tests.clear_authentication();
select is((select a->>'status' from g4_leave), 'ok', 'G4 leave_room answers ok');
select is(
  (select m.left_at is not null from public.room_members m where m.id = tests.member_id('r3')),
  true,
  'G4 the seat of the player who left has left_at set'
);
select is(
  (select mt.title_id = tests.film(1) and mt.kind = 'unanimous' and mt.like_count = 2
          and mt.present_count = 2 and mt.pick_order = 1
   from public.matches mt where mt.room_id = tests.room_id()),
  true,
  'G4 leaving made film 1 a unanimous match of the 2 players still here, pick order 1'
);
select is((select r.state::text from public.rooms r where r.id = tests.room_id()), 'done', 'G4 the room is done');
select is(
  (select m->>'decided' from tests.broadcasts(tests.room_id(), 'match') m),
  'true',
  'G4 one match broadcast says decided'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'member_left') m
   where (m->>'member_id')::uuid = tests.member_id('r3')),
  1::bigint,
  'G4 one member_left broadcast names the seat that left'
);
select is(
  (select count(*) from tests.queued('room_finished') q where (q->>'room_id')::uuid = tests.room_id()),
  1::bigint,
  'G4 one room_finished message is queued for the room'
);

-- G4b: the host leaving hands the role to the longest-seated player (beyond the 120).
select tests.deal_game(3, 'h', 'lobby');
update public.room_members set joined_at = now() - interval '3 minutes' where id = tests.member_id('h1');
update public.room_members set joined_at = now() - interval '2 minutes' where id = tests.member_id('h2');
update public.room_members set joined_at = now() - interval '1 minute' where id = tests.member_id('h3');
select is(
  (select m.role::text from public.room_members m where m.id = tests.member_id('h1')),
  'host',
  'G4b positive control: h1 is the host before leaving (beyond the 120)'
);
select tests.authenticate_as('h1');
create temp table g4b_first as select api.leave_room(tests.room_id()) as a;
create temp table g4b_second as select api.leave_room(tests.room_id()) as a;
select tests.clear_authentication();
select is((select a->>'status' from g4b_first), 'ok', 'G4b the host''s leave_room answers ok (beyond the 120)');
select is(
  (select m.role::text from public.room_members m where m.id = tests.member_id('h2')),
  'host',
  'G4b the longest-seated player, h2, is now the host (beyond the 120)'
);
select is(
  (select m.role::text from public.room_members m where m.id = tests.member_id('h1')),
  'guest',
  'G4b the player who left is a guest (beyond the 120)'
);
select is(
  (select r.host_id from public.rooms r where r.id = tests.room_id()),
  tests.uid('h2'),
  'G4b rooms.host_id is h2 (beyond the 120)'
);
select is(
  (select m->>'new_host_member_id' from tests.broadcasts(tests.room_id(), 'member_left') m),
  tests.member_id('h2')::text,
  'G4b member_left carries the new host seat (beyond the 120)'
);
select is((select a->>'status' from g4b_second), 'not_in_room', 'G4b a second leave_room answers not_in_room (beyond the 120)');

-- G5, G8c: Final Cut records a match without ending.
select tests.deal_game(3, 'f', 'swiping', 'final_cut');
select tests.vote('f1', 1);
select tests.vote('f2', 1);
create temp table g5_third as select tests.vote('f3', 1) as a;
select is(
  (select a->>'status' || '/' || (a->>'match') || '/' || (a->>'decided') from g5_third),
  'ok/true/false',
  'G5 the third like is a match that does not decide'
);
select is(
  (select mt.title_id = tests.film(1) and mt.pick_order is null
   from public.matches mt where mt.room_id = tests.room_id()),
  true,
  'G5 the match is recorded without a pick order'
);
select is((select r.state::text from public.rooms r where r.id = tests.room_id()), 'swiping', 'G5 the room stays swiping');
select is(
  (select m->>'decided' from tests.broadcasts(tests.room_id(), 'match') m),
  'false',
  'G5 the match broadcast says decided is false'
);
select is(
  (select count(*) from tests.queued('room_finished') q where (q->>'room_id')::uuid = tests.room_id()),
  0::bigint,
  'G5 no room_finished message is queued'
);

select tests.authenticate_as('f3');
create temp table g8c_undo as select api.undo_last_vote(tests.room_id()) as a;
select tests.clear_authentication();
select is((select a->>'status' from g8c_undo), 'locked', 'G8c undoing the vote on a matched card answers locked (beyond the 120)');
select is(
  (select count(*) from public.votes v where v.room_member_id = tests.member_id('f3') and v.title_id = tests.film(1)),
  1::bigint,
  'G8c the vote on the matched card remains (beyond the 120)'
);

-- G6, G6b: Final Cut opens the finale with the matched film seeded first.
select tests.vote('f1', 3, 'super_like');
select tests.vote('f2', 2);
select is(
  (select count(*) from public.rounds where room_id = tests.room_id()),
  0::bigint,
  'G6b positive control: no finale yet after a super like and a like (beyond the 120)'
);
select is(
  (select (internal.pick_rule(r.rule, 3)->>'finale_after_seconds') is not null
   from public.rooms r where r.id = tests.room_id()),
  true,
  'G6b the rule for 3 players has a time limit to run out (beyond the 120)'
);
update public.rooms r
set started_at = now() - make_interval(secs => (internal.pick_rule(r.rule, 3)->>'finale_after_seconds')::int + 1)
where r.id = tests.room_id();

create temp table g6_vote as select tests.vote('f3', 10, 'nope') as a;
select is(
  (select (a->>'finale_round_id') is not null from g6_vote),
  true,
  'G6 the vote after the time limit answers with finale_round_id'
);
select is(
  (select r.state::text || '/' || (r.finale_at is not null) from public.rooms r where r.id = tests.room_id()),
  'finale/true',
  'G6 the room is in the finale with finale_at set'
);
select is(
  (select count(*) from public.rounds where room_id = tests.room_id()),
  1::bigint,
  'G6 exactly one round exists'
);
select is(
  (select ro.id::text || '/' || ro.kind::text from public.rounds ro where ro.room_id = tests.room_id()),
  (select (a->>'finale_round_id') || '/final_cut' from g6_vote),
  'G6 the round is the one the vote answered with, of kind final_cut'
);
select is(
  (select rc.title_id from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
   where ro.room_id = tests.room_id() and rc.seed = 1),
  tests.film(1),
  'G6 the seed 1 candidate is the matched film 1'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'finale_started')),
  1::bigint,
  'G6 one finale_started broadcast is sent'
);
select is(
  (select f->>'round_id' || '/' || (f->'title_ids'->>0)
   from tests.broadcasts(tests.room_id(), 'finale_started') f),
  (select (a->>'finale_round_id') || '/' || tests.film(1) from g6_vote),
  'G6 finale_started carries the round id and film 1 first'
);
select is(
  (select array_agg(rc.title_id order by rc.seed)
   from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
   where ro.room_id = tests.room_id() and rc.seed in (2, 3)),
  array[tests.film(3), tests.film(2)],
  'G6b seeds 2 and 3 are film 3 (one super like counts double) then film 2 (one like), though film 2 has the higher group score (beyond the 120)'
);

-- G6c: a matched film is seeded first even when another film has more points (beyond the 120).
-- Film 1 matches with 4 likes of 5 (4 points). Film 2 does not match (3 of 5) but has two
-- super likes and one like (5 points).
select tests.deal_game(5, 'g', 'swiping', 'final_cut');
select tests.vote('g1', 1);
select tests.vote('g2', 1);
select tests.vote('g3', 1);
select tests.vote('g4', 1);
select tests.vote('g1', 2, 'super_like');
select tests.vote('g2', 2, 'super_like');
select tests.vote('g3', 2);
select tests.vote('g4', 2, 'nope');
select is(
  (select count(*) from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(1))
  || '/' || (select count(*) from public.matches mt where mt.room_id = tests.room_id() and mt.title_id = tests.film(2)),
  '1/0',
  'G6c positive control: film 1 matched and film 2 did not (beyond the 120)'
);
update public.rooms r
set started_at = now() - make_interval(secs => (internal.pick_rule(r.rule, 5)->>'finale_after_seconds')::int + 1)
where r.id = tests.room_id();
select tests.vote('g5', 10, 'nope');
select is(
  (select array_agg(rc.title_id order by rc.seed)
   from public.round_candidates rc join public.rounds ro on ro.id = rc.round_id
   where ro.room_id = tests.room_id() and rc.seed in (1, 2)),
  array[tests.film(1), tests.film(2)],
  'G6c the matched film 1 is seed 1 and film 2, with more points but no match, is seed 2 (beyond the 120)'
);

select * from finish();
rollback;

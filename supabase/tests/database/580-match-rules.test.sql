-- M6.1: the confirmed match_rules values and the fixed re-check order
-- (decisions.md rows 12 and 13, game-modes.md#time-to-a-pick, game-modes.md#when-its-a-match).
-- Card counts, time limits and finale sizes are read from rooms.rule, frozen at begin_swiping.

begin;
select plan(24);

select tests.create_catalog(40);

-- 1. The seed holds the decided values, value for value.
select is(
  (select string_agg(
            mr.mode || ' ' || mr.min_players || '-' || mr.max_players || ' ' || mr.instant_rule || ' '
            || coalesce(mr.share_threshold::text, '-') || ' ' || mr.finale_kind || ' '
            || mr.finale_after_cards || ' ' || mr.finale_after_seconds || ' ' || mr.finale_size,
            E'\n' order by mr.mode, mr.min_players)
   from public.match_rules mr),
  $t$date_night 2-2 all_like - final_cut 40 360 3
final_cut 2-2 all_like - final_cut 30 360 3
final_cut 3-4 all_like - final_cut 30 360 4
final_cut 5-10 share_like 0.70 final_cut 30 360 4
quick_match 2-2 all_like - final_cut 40 360 3
quick_match 3-4 all_like - final_cut 40 360 4
quick_match 5-10 share_like 0.70 ranked_vote 30 360 4$t$,
  'M6.1 the seed holds the decided rows of every mode'
);

-- 2. Each mode's brackets cover 2 to its max_players, with no gap and no overlap.
select is(
  (select count(*) from public.game_modes gm
   where (select min(mr.min_players) from public.match_rules mr where mr.mode = gm.slug) <> 2
      or (select max(mr.max_players) from public.match_rules mr where mr.mode = gm.slug) <> gm.max_players),
  0::bigint,
  'M6.1 every mode''s brackets start at 2 and end at the mode''s max_players'
);
select is(
  (select count(*) from public.match_rules a
   join public.match_rules b on b.mode = a.mode and b.id <> a.id
        and b.min_players <= a.max_players and a.min_players <= b.max_players),
  0::bigint,
  'M6.1 no two brackets of a mode overlap'
);
select is(
  (select count(*) from public.match_rules a
   where a.max_players < (select gm.max_players from public.game_modes gm where gm.slug = a.mode)
     and not exists (select 1 from public.match_rules b
                     where b.mode = a.mode and b.min_players = a.max_players + 1)),
  0::bigint,
  'M6.1 no gap: each bracket is followed by one starting at its max plus one'
);

-- 3. A Final Cut room: 3 finalists for 2 players, 4 for 3.
select tests.deal_game(2, 'f', 'swiping', 'final_cut');
select is(
  (select (internal.pick_rule(r.rule, 2)->>'finale_size')::int from public.rooms r where r.id = tests.room_id()),
  3,
  'M6.1 a 2-player Final Cut room has 3 finalists'
);
select is(
  (select (internal.pick_rule(r.rule, 3)->>'finale_size')::int from public.rooms r where r.id = tests.room_id()),
  4,
  'M6.1 with 3 players a Final Cut room has 4 finalists'
);

-- 7, 8. Card counts and the 5 to 10 rule, read from a Quick Match room's frozen rule.
select tests.deal_game(2, 'q', 'swiping');
select is(
  (select (internal.pick_rule(r.rule, 4)->>'finale_after_cards')::int from public.rooms r where r.id = tests.room_id()),
  40,
  'M6.1 4 players: 40 cards (was 50)'
);
select is(
  (select (internal.pick_rule(r.rule, 5)->>'finale_after_cards')::int from public.rooms r where r.id = tests.room_id()),
  30,
  'M6.1 5 players: 30 cards (was 50)'
);
select is(
  (select internal.pick_rule(r.rule, 5)->>'instant_rule' || '/' || (internal.pick_rule(r.rule, 5)->>'share_threshold')::numeric
          || '/' || (internal.pick_rule(r.rule, 5)->>'finale_kind')
   from public.rooms r where r.id = tests.room_id()),
  'share_like/0.70/ranked_vote',
  'M6.1 5 present players: share_like at 0.70 with a ranked vote'
);

-- 4. A 2-player Quick Match room now has a time limit of 360 seconds.
select tests.deal_game(2, 't', 'swiping');
-- M6.4: the finale needs a film with a like (decision row 12), so the room has one before the limit runs out.
select tests.vote('t1', 3, 'like');
update public.rooms set started_at = now() - interval '359 seconds' where id = tests.room_id();
select is(
  (select tests.vote('t1', 1, 'nope') ? 'finale_round_id'),
  false,
  'M6.1 positive control: 2 players, 359 seconds in, a vote starts no finale'
);
update public.rooms set started_at = now() - interval '361 seconds' where id = tests.room_id();
select is(
  (select tests.vote('t1', 2, 'nope') ? 'finale_round_id'),
  true,
  'M6.1 2 players, 361 seconds in, a vote starts the finale (it had no limit before)'
);
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id()),
  'finale',
  'M6.1 the 2-player room is in the finale'
);

-- 5. A 3-player room 300 seconds in has no finale; 361 does (the limit was 480).
select tests.deal_game(3, 'u', 'swiping');
select tests.vote('u1', 3, 'like');
update public.rooms set started_at = now() - interval '300 seconds' where id = tests.room_id();
select is(
  (select tests.vote('u1', 1, 'nope') ? 'finale_round_id'),
  false,
  'M6.1 positive control: 3 players, 300 seconds in, no finale'
);
update public.rooms set started_at = now() - interval '361 seconds' where id = tests.room_id();
select is(
  (select tests.vote('u1', 2, 'nope') ? 'finale_round_id'),
  true,
  'M6.1 3 players, 361 seconds in, the finale starts (the limit was 480)'
);

-- 6. 2 players: the finale starts when both seats reach 40 swipes, not before.
select tests.deal_game(2, 's', 'swiping');
select tests.vote('s1', 3, 'like');
update public.room_members set swipe_count = 38 where id = tests.member_id('s1');
update public.room_members set swipe_count = 40 where id = tests.member_id('s2');
select is(
  (select tests.vote('s1', 1, 'nope') ? 'finale_round_id'),
  false,
  'M6.1 positive control: seats at 39 and 40 start no finale'
);
select is(
  (select tests.vote('s1', 2, 'nope') ? 'finale_round_id'),
  true,
  'M6.1 seats at 40 and 40 start the finale'
);

-- 9. Equal likes: the film with more super likes is the match when a leave completes both.
select tests.deal_game(3, 'a', 'swiping');
select tests.vote('a1', 1);
select tests.vote('a2', 1);
select tests.vote('a1', 2, 'super_like');
select tests.vote('a2', 2);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()),
  0::bigint,
  'M6.1 positive control: two films are liked by 2 of 3 and nothing matched yet'
);
select tests.authenticate_as('a3');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(
  (select string_agg(mt.title_id::text, ',') from public.matches mt where mt.room_id = tests.room_id()),
  tests.film(2)::text,
  'M6.1 equal likes: the film with the super like is the match, though film 1 has the lower id'
);
select is(
  (select r.state::text from public.rooms r where r.id = tests.room_id()),
  'done',
  'M6.1 the room is done after that leave'
);

-- 10. Equal likes and super likes: the higher group score wins.
select tests.deal_game(3, 'b', 'swiping');
select tests.vote('b1', 1);
select tests.vote('b2', 1);
select tests.vote('b1', 2);
select tests.vote('b2', 2);
update public.room_cards set group_score = 9 where room_id = tests.room_id() and title_id = tests.film(2);
select tests.authenticate_as('b3');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(
  (select string_agg(mt.title_id::text, ',') from public.matches mt where mt.room_id = tests.room_id()),
  tests.film(2)::text,
  'M6.1 equal likes and super likes: the higher group score wins'
);

-- 10b. All equal: the lower title_id wins. Film 1's card row is rewritten last, so a
-- storage-order walk would reach it after film 2.
select tests.deal_game(3, 'c', 'swiping');
select tests.vote('c1', 1);
select tests.vote('c2', 1);
select tests.vote('c1', 2);
select tests.vote('c2', 2);
update public.room_cards set group_score = 3 where room_id = tests.room_id() and title_id = tests.film(2);
update public.room_cards set group_score = 3 where room_id = tests.room_id() and title_id = tests.film(1);
select tests.authenticate_as('c3');
select api.leave_room(tests.room_id());
select tests.clear_authentication();
select is(
  (select string_agg(mt.title_id::text, ',') from public.matches mt where mt.room_id = tests.room_id()),
  tests.film(1)::text,
  'M6.1 everything equal: the lowest title_id wins'
);

-- 11. A room already swiping keeps its rule when the table changes later.
create temp table m61_frozen as select r.rule from public.rooms r where r.id = tests.room_id();
update public.match_rules set finale_after_cards = 99, finale_after_seconds = 1 where mode = 'quick_match';
select is(
  (select r.rule from public.rooms r where r.id = tests.room_id()),
  (select rule from m61_frozen),
  'M6.1 a room already swiping keeps the rule it started with'
);

-- The helper stays closed to phones.
select is(
  (select has_function_privilege('authenticated', 'internal.recheck_room_matches(uuid)', 'execute')),
  false,
  'M6.1 recheck_room_matches is not open to signed-in phones'
);
select is(
  (select has_function_privilege('anon', 'internal.recheck_room_matches(uuid)', 'execute')),
  false,
  'M6.1 recheck_room_matches is not open to anon'
);

select * from finish();
rollback;

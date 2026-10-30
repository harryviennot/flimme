-- Swipes, like propagation, "Seen it" and undo (data-model.md#a-swipe and
-- #like-propagation-and-refills, game-modes.md#the-answers). G3b, G8b and G8d are
-- beyond the 120 checks of data-model.md#what-was-tested.
--
-- "Seen it" is tested only under hide_seen, set on the room explicitly (M6.2 changes the
-- other rules). Undo is used once per seat, on a seat with one vote (M6.3 changes it).

begin;
select plan(32);

select tests.create_catalog(40);

-- G3, G3b: the first like on a card moves it between the 3rd and 4th upcoming cards of the other seat.
select tests.deal_game(2, 'q');
select tests.vote_next('q2', 15);
select is((tests.upcoming('q2'))[10], tests.film(11), 'G3 precondition: film 11 is q2''s 10th upcoming card');
select tests.vote_next('q1', 10);
select is(
  (tests.upcoming('q2'))[1:3],
  array[tests.film(20), tests.film(19), tests.film(18)],
  'G3 positive control: q2''s first three upcoming films are 20, 19, 18 before the like'
);
select is((tests.vote('q1', 11)->>'match'), 'false', 'G3 q1''s like on film 11 is not a match');
select is(
  (tests.upcoming('q2'))[1:3],
  array[tests.film(20), tests.film(19), tests.film(18)],
  'G3 q2''s first three upcoming films are unchanged'
);
select is((tests.upcoming('q2'))[4], tests.film(11), 'G3 film 11 is now q2''s 4th upcoming card');
select is(
  (select e.source::text from public.deck_entries e
   where e.room_member_id = tests.member_id('q2') and e.title_id = tests.film(11)),
  'propagated',
  'G3 the deck entry of film 11 for q2 has source propagated'
);
select is(cardinality(tests.upcoming('q2')), 10, 'G3 q2 still has 10 upcoming cards');
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'deck_updated') d
   where (d->'member_ids') ? tests.member_id('q2')::text and not ((d->'member_ids') ? tests.member_id('q1')::text)),
  1::bigint,
  'G3 one deck_updated broadcast lists q2''s seat and not q1''s'
);

select tests.vote('q1', 19);
select is(
  ((tests.upcoming('q2'))[2] = tests.film(19)) and (
    select e.source::text from public.deck_entries e
    where e.room_member_id = tests.member_id('q2') and e.title_id = tests.film(19)) = 'ranked',
  true,
  'G3b a like on a card already 2nd stays 2nd with source ranked (beyond the 120)'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'deck_updated')),
  1::bigint,
  'G3b no second deck_updated broadcast is sent (beyond the 120)'
);

-- G7: "seen it" drops a card for the others (hide_seen).
select tests.deal_game(3, 's');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();
select is(
  (select count(*) from public.deck_entries e where e.title_id = tests.film(1) and e.room_id = tests.room_id()),
  3::bigint,
  'G7 positive control: film 1 is in all three decks before "seen it"'
);
select is(tests.vote('s1', 1, 'seen')->>'status', 'ok', 'G7 s1''s "seen it" answers ok');
select is(
  (select c.state::text || '/' || c.seen_count from public.room_cards c
   where c.room_id = tests.room_id() and c.title_id = tests.film(1)),
  'dropped/1',
  'G7 film 1''s card is dropped with seen_count 1'
);
select is(
  (select count(*) from public.deck_entries e
   where e.title_id = tests.film(1) and e.room_member_id = tests.member_id('s1')),
  1::bigint,
  'G7 s1 keeps its deck entry for film 1'
);
select is(
  (select count(*) from public.deck_entries e
   where e.title_id = tests.film(1) and e.room_member_id in (tests.member_id('s2'), tests.member_id('s3'))),
  0::bigint,
  'G7 s2 and s3 have no deck entry for film 1'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'deck_updated') d
   where (d->'member_ids') ? tests.member_id('s2')::text and (d->'member_ids') ? tests.member_id('s3')::text
     and not ((d->'member_ids') ? tests.member_id('s1')::text)),
  1::bigint,
  'G7 one deck_updated broadcast lists s2 and s3 and not s1'
);
select is(tests.vote('s2', 1)->>'status', 'dropped', 'G7 s2''s vote on film 1 answers dropped');
select is(
  (select count(*) from public.votes v where v.room_member_id = tests.member_id('s2') and v.title_id = tests.film(1)),
  0::bigint,
  'G7 s2 has no vote on film 1'
);
select is(
  (select count(*) from public.matches where room_id = tests.room_id()),
  0::bigint,
  'G7 "seen it" can''t match: no matches rows'
);
select is((tests.upcoming('s2'))[1], tests.film(2), 'G7 s2''s next card is film 2');

-- G8, G8b, G8d: undo refunds a super like.
select tests.deal_game(2, 'u');
select is(tests.vote('u1', 1, 'super_like')->>'status', 'ok', 'G8 u1''s super like answers ok');
select is(
  (select m.super_likes_left::integer from public.room_members m where m.id = tests.member_id('u1')),
  1,
  'G8 the super like spent one of the two'
);
select tests.authenticate_as('u1');
create temp table g8_undo as select api.undo_last_vote(tests.room_id()) as a;
select tests.clear_authentication();
select is(
  (select a->>'status' || '/' || (a->>'title_id') from g8_undo),
  'ok/' || tests.film(1),
  'G8 undo answers ok with the film'
);
select is(
  (select m.super_likes_left || '/' || m.swipe_count from public.room_members m where m.id = tests.member_id('u1')),
  '2/0',
  'G8 the seat has 2 super likes left and swipe_count 0'
);
select is(
  (select c.super_like_count::integer from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(1)),
  0,
  'G8 the card''s super_like_count is back to 0'
);
select is(
  (select count(*) from public.votes v where v.room_member_id = tests.member_id('u1') and v.title_id = tests.film(1)),
  0::bigint,
  'G8 u1 has no vote on film 1'
);
select is(
  (select count(*) from public.swipe_log l
   where l.room_member_id = tests.member_id('u1') and l.action = 'undo' and l.answer = 'super_like'),
  1::bigint,
  'G8 one swipe_log row records the undo of a super like'
);

select tests.vote('u1', 1, 'super_like');
select tests.vote('u1', 2, 'super_like');
select is(tests.vote('u1', 3, 'super_like')->>'status', 'no_super_likes', 'G8b a third super like answers no_super_likes (beyond the 120)');
select is(
  (select count(*) from public.votes v where v.room_member_id = tests.member_id('u1') and v.title_id = tests.film(3))
  || '/' || (select m.super_likes_left from public.room_members m where m.id = tests.member_id('u1')),
  '0/0',
  'G8b no vote on film 3 and no super likes left (beyond the 120)'
);
select is(tests.vote('u1', 2, 'like')->>'status', 'duplicate', 'G8b a second answer on film 2 is a duplicate (beyond the 120)');
select is(
  (select c.super_like_count || '/' || c.like_count from public.room_cards c
   where c.room_id = tests.room_id() and c.title_id = tests.film(2)),
  '1/0',
  'G8b the duplicate changed no counter on film 2 (beyond the 120)'
);

select tests.authenticate_as('u2');
create temp table g8d_undo as select api.undo_last_vote(tests.room_id()) as a;
select tests.clear_authentication();
select is((select a->>'status' from g8d_undo), 'nothing_to_undo', 'G8d undo with no vote answers nothing_to_undo (beyond the 120)');

select * from finish();
rollback;

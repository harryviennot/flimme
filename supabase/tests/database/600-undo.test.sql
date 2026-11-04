-- M6.3: Undo takes back the last swipe only, once; undoing "Seen it" brings the film back; counters
-- reverse by the answer's meaning; the seen mark goes with it; the near miss toast is corrected
-- (game-modes.md#the-answers "Undo", moments.md#the-near-miss).

begin;
select plan(38);

select tests.create_catalog(40);

create function pg_temp.undo(p_name text, p_room uuid default tests.room_id()) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.undo_last_vote(p_room);
  perform tests.clear_authentication();
  return v;
end $$;

-- like / super like / nope / seen counts of a film in the last room.
create function pg_temp.counts(p_film integer) returns text language sql as $$
  select c.like_count || '/' || c.super_like_count || '/' || c.nope_count || '/' || c.seen_count
  from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(p_film)
$$;

create function pg_temp.voted(p_name text, p_film integer) returns bigint language sql as $$
  select count(*) from public.votes v where v.room_member_id = tests.member_id(p_name) and v.title_id = tests.film(p_film)
$$;

create function pg_temp.near(p_film integer) returns bigint language sql as $$
  select count(*) from tests.broadcasts(tests.room_id(), 'near_miss') n where n->>'title_id' = tests.film(p_film)::text
$$;

-- T1: vote, undo.
select tests.deal_game(3, 'a');
select tests.vote('a1', 1, 'like');
select is(pg_temp.undo('a1'), jsonb_build_object('status', 'ok', 'title_id', tests.film(1)), 'T1 undo answers ok with the film');
select is(pg_temp.voted('a1', 1) || '/' || pg_temp.counts(1)
  || '/' || (select m.swipe_count from public.room_members m where m.id = tests.member_id('a1')),
  '0/0/0/0/0/0', 'T1 the vote is gone, the counters and swipe_count are back');

-- T2: a second undo in a row.
select tests.vote('a1', 2, 'like');
select tests.vote('a1', 3, 'nope');
select is(pg_temp.undo('a1')->>'status', 'ok', 'T2 the first undo is ok');
select is(pg_temp.undo('a1')->>'status', 'nothing_to_undo', 'T2 the second undo in a row answers nothing_to_undo');
select is(pg_temp.voted('a1', 2), 1::bigint, 'T2 the earlier vote stays');

-- T3: vote A, vote B, undo (B), vote C, undo: undoes C.
select tests.deal_game(3, 'b');
select tests.vote('b1', 1); select tests.vote('b1', 2);
select is(pg_temp.undo('b1')->>'title_id', tests.film(2)::text, 'T3 the first undo takes back B');
select tests.vote('b1', 3);
select is(pg_temp.undo('b1')->>'title_id', tests.film(3)::text, 'T3 after a new vote the undo takes back C');
select is(pg_temp.voted('b1', 1), 1::bigint, 'T3 A is untouched');

-- T4: like, undo, like, undo on one film.
select tests.deal_game(3, 'c');
select tests.vote('c1', 1);
select is(pg_temp.undo('c1')->>'status', 'ok', 'T4 first undo ok');
select tests.vote('c1', 1);
select is(pg_temp.undo('c1')->>'status', 'ok', 'T4 the second undo on the same film is ok again');

-- T5: a matched card is locked.
select tests.deal_game(3, 'd', 'swiping', 'final_cut');
select tests.vote('d1', 1); select tests.vote('d2', 1); select tests.vote('d3', 1);
select is(pg_temp.undo('d3')->>'status', 'locked', 'T5 a matched card answers locked');
select is(pg_temp.voted('d3', 1), 1::bigint, 'T5 the vote stays');

-- T6: hide_seen, my Seen it dropped the film; undo brings it back.
select tests.deal_game(3, 'e');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();
select tests.vote('e1', 5, 'seen');
select is((select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(5)),
  'dropped', 'T6 positive control: the film was dropped');
select is((select count(*) from public.deck_entries d where d.room_member_id = tests.member_id('e2') and d.title_id = tests.film(5)),
  0::bigint, 'T6 positive control: e2 lost the entry');
select is(pg_temp.undo('e1')->>'status', 'ok', 'T6 undo of the Seen it answers ok');
select is((select c.state::text || '/' || c.seen_count from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(5)),
  'active/0', 'T6 the card is active again, seen_count 0');
select internal.deal_baseline(tests.room_id(), tests.member_id('e2'));
select is((select count(*) from public.deck_entries d where d.room_member_id = tests.member_id('e2') and d.title_id = tests.film(5)),
  1::bigint, 'T6 the next refill deals the film back to e2');

-- T7: hide_seen, a film dropped by another seat after my like: locked.
select tests.deal_game(3, 'f');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();
select tests.vote('f1', 5, 'like');
select tests.vote('f2', 5, 'seen');
select is(pg_temp.undo('f1')->>'status', 'locked', 'T7 undoing my like on a film another seat dropped answers locked');
select is(pg_temp.voted('f1', 5), 1::bigint, 'T7 the vote stays');

-- T8: the seen mark.
select tests.deal_game(3, 'g');
select tests.vote('g1', 1, 'seen');
select is((select count(*) from public.user_titles where profile_id = tests.uid('g1') and title_id = tests.film(1)),
  1::bigint, 'T8 positive control: the vote saved a mark');
select pg_temp.undo('g1');
select is((select count(*) from public.user_titles where profile_id = tests.uid('g1') and title_id = tests.film(1)),
  0::bigint, 'T8 a new mark is deleted by the undo');
insert into public.user_titles (profile_id, title_id, source, seen, updated_at)
values (tests.uid('g2'), tests.film(2), 'app', true, now() - interval '30 days');
select tests.vote('g2', 2, 'seen');
select pg_temp.undo('g2');
select is((select ut.seen from public.user_titles ut where ut.profile_id = tests.uid('g2') and ut.title_id = tests.film(2)),
  true, 'T8 a mark that existed before the vote stays');
insert into public.user_titles (profile_id, title_id, source, reaction)
values (tests.uid('g3'), tests.film(3), 'app', 'love');
select tests.vote('g3', 3, 'seen');
select pg_temp.undo('g3');
select is((select ut.seen || '/' || ut.reaction::text from public.user_titles ut where ut.profile_id = tests.uid('g3') and ut.title_id = tests.film(3)),
  'false/love', 'T8 a row with a reaction keeps it, and seen goes back to false');

-- T9: counters by meaning.
select tests.deal_game(3, 'h');
update public.rooms set seen_rule = 'allow_rewatch' where id = tests.room_id();
select tests.vote('h1', 1, 'seen_rewatch');
select tests.vote('h2', 2, 'seen');
select is(pg_temp.counts(2), '0/0/1/1', 'T9 positive control: a plain seen under allow_rewatch is a nope and a seen');
select pg_temp.undo('h2');
select is(pg_temp.counts(2), '0/0/0/0', 'T9 undoing a plain seen under allow_rewatch takes back the nope and the seen');
select pg_temp.undo('h1');
select is(pg_temp.counts(1), '0/0/0/0', 'T9 undoing a seen_rewatch takes back the like and the seen');
select is((select count(*) from public.user_titles where profile_id = tests.uid('h1') and title_id = tests.film(1)),
  0::bigint, 'T9 the mark of a seen_rewatch goes too');
select tests.deal_game(3, 'i');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();
select tests.vote('i1', 3, 'seen');
select pg_temp.undo('i1');
select is(pg_temp.counts(3), '0/0/0/0', 'T9 under hide_seen only seen_count is taken back');

-- T10: a super like comes back.
select tests.deal_game(3, 'j');
select tests.vote('j1', 1, 'super_like');
select pg_temp.undo('j1');
select is((select m.super_likes_left::integer from public.room_members m where m.id = tests.member_id('j1')) || '/' || pg_temp.counts(1),
  '2/0/0/0/0', 'T10 the super like comes back and the count is back');

-- T11: a propagated like stays where it moved.
select tests.deal_game(2, 'k');
select tests.vote_next('k2', 15);
select tests.vote_next('k1', 10);
select tests.vote('k1', 11, 'like');
select pg_temp.undo('k1');
select is((tests.upcoming('k2'))[4], tests.film(11), 'T11 the film stays where the like moved it in k2''s deck');

-- T12: a seat that left, or was removed.
select tests.deal_game(3, 'l');
select tests.vote('l2', 1); select tests.vote('l3', 2);
select tests.authenticate_as('l2');
select api.leave_room(tests.room_id());
select throws_ok(format('select api.undo_last_vote(%L)', tests.room_id()), '42501', null, 'T12 a seat that left raises 42501');
select tests.authenticate_as('l1');
select api.remove_member(tests.room_id(), tests.member_id('l3'));
select tests.authenticate_as('l3');
select throws_ok(format('select api.undo_last_vote(%L)', tests.room_id()), '42501', null, 'T12 a removed seat raises 42501');
select tests.clear_authentication();

-- T13: Party near miss corrected after undoing a like.
select tests.deal_game(3, 'm');
select tests.vote('m1', 1); select tests.vote('m2', 1);
select is(pg_temp.near(1), 1::bigint, 'T13 positive control: the near miss was sent');
select pg_temp.undo('m2');
select is(pg_temp.near(1), 2::bigint, 'T13 undoing the like sends one more near_miss');
select is((select n->>'likes' || '/' || (n->>'of') || '/' || (n->>'needed')
           from tests.broadcasts(tests.room_id(), 'near_miss') n
           order by (n->>'likes')::int limit 1), '1/3/3', 'T13 with the corrected counts');
select tests.deal_game(3, 'n');
update public.rooms set reveal = 'blind' where id = tests.room_id();
select tests.vote('n1', 1); select tests.vote('n2', 1);
select pg_temp.undo('n2');
select is(pg_temp.near(1), 0::bigint, 'T13 Blind sends no near_miss');
select tests.deal_game(3, 'o');
select tests.vote('o1', 1);
select pg_temp.undo('o1');
select is(pg_temp.near(1), 0::bigint, 'T13 a like that was not at the near miss line sends nothing');

-- T14: not swiping.
select tests.deal_game(2, 'p', 'lobby');
select is(pg_temp.undo('p1')->>'status', 'closed', 'T14 outside swiping the answer is closed');

select * from finish();
rollback;

-- M5.7: api.cast_vote accepts a vote on any active card in the room's pool, restoring the seat's
-- deck entry if a re-rank removed it (data-model.md#a-swipe, app-structure.md#changes-this-asks-of-the-backend).
-- Restored entry: source ranked, score = the pool's group score (decisions Q7.2).

begin;
select plan(39);

select tests.create_catalog(45);
select tests.deal_game(2);

-- Films 26 to 40 join the pool; p1 is re-ranked with films 26 to 38, keeping the 3 mounted cards
-- (films 1 to 3). Films 4 to 25 leave p1's deck but stay active in the pool; films 39 and 40 were
-- never dealt to p1. p1 is left with 16 cards ahead. p2 keeps its deck.
select tests.act_as_server();
select is(internal.deal_cards(tests.room_id(), jsonb_build_object(
    'request', jsonb_build_object('kind', 'refill', 'room_member_id', tests.member_id('p1'), 'model_version', 'test-ranker'),
    'pool', (select jsonb_agg(jsonb_build_object(
        'title_id', tests.film(n), 'group_score', 4.0 - n / 100.0, 'min_fit', 3, 'fits', '{}'::jsonb,
        'source', 'ranked', 'reason_code', 'runtime_fit', 'reason_params', '{}'::jsonb, 'member_ratings', '[]'::jsonb) order by n)
      from generate_series(26, 40) n),
    'decks', jsonb_build_array(jsonb_build_object('room_member_id', tests.member_id('p1'), 'keep', 3, 'cards',
      (select jsonb_agg(jsonb_build_object(
          'title_id', tests.film(n), 'source', 'ranked', 'score', 4.0 - n / 100.0, 'explore', false,
          'propensity', 0.5, 'features', '{}'::jsonb) order by n)
       from generate_series(26, 38) n)))))->>'status',
  'ok', 'setup: the re-rank is applied');
select tests.clear_authentication();

create function pg_temp.has_entry(p_name text, p_film integer) returns boolean
language sql as $$
  select exists (select 1 from public.deck_entries d
                 where d.room_member_id = tests.member_id(p_name) and d.title_id = tests.film(p_film))
$$;
create function pg_temp.card(p_film integer) returns public.room_cards
language sql as $$
  select c from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(p_film)
$$;
create function pg_temp.remaining(p_name text) returns bigint
language sql as $$
  select count(*) from public.deck_entries d
  where d.room_member_id = tests.member_id(p_name)
    and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
$$;

select is(pg_temp.has_entry('p1', 5), false, 'setup: film 5 was removed from p1''s deck by the re-rank');
select is(pg_temp.has_entry('p1', 39), false, 'setup: film 39 was never dealt to p1');
select is(pg_temp.remaining('p1'), 16::bigint, 'setup: p1 has 16 cards ahead');
select set_config('tests.max_sort', (select max(sort_key)::text from public.deck_entries where room_member_id = tests.member_id('p1')), true);

-- T1: the race. p1 likes a card the re-rank removed.
select is(tests.vote('p1', 5, 'like')->>'status', 'ok', 'T1 a like on a removed card answers ok');
select is((select answer::text from public.votes where room_member_id = tests.member_id('p1') and title_id = tests.film(5)),
  'like', 'T1 the vote is saved');
select is((pg_temp.card(5)).like_count::int, 1, 'T1 the like is counted');
select is((select d.source::text from public.deck_entries d where d.room_member_id = tests.member_id('p1') and d.title_id = tests.film(5)),
  'ranked', 'T1 the restored entry has source ranked');
select is((select d.score from public.deck_entries d where d.room_member_id = tests.member_id('p1') and d.title_id = tests.film(5)),
  (pg_temp.card(5)).group_score, 'T1 the restored entry has the pool''s group score');
select is((select d.sort_key::numeric from public.deck_entries d where d.room_member_id = tests.member_id('p1') and d.title_id = tests.film(5)),
  current_setting('tests.max_sort')::numeric + 1, 'T1 the restored entry sorts after the seat''s last entry');
select is((select d.request_id from public.deck_entries d where d.room_member_id = tests.member_id('p1') and d.title_id = tests.film(5)),
  null, 'T1 the restored entry has no request');
select is((select l.deck_source::text || '/' || (l.score = (pg_temp.card(5)).group_score)::text from public.swipe_log l
           where l.room_member_id = tests.member_id('p1') and l.title_id = tests.film(5) and l.action = 'vote'),
  'ranked/true', 'T1 swipe_log has that source and score');
select is(pg_temp.remaining('p1'), 16::bigint, 'T1 a restored, voted card is not among the remaining cards');

-- T2: a nope, and a seen under hide_seen.
select is(tests.vote('p1', 6, 'nope')->>'status', 'ok', 'T2 a nope on a removed card answers ok');
select is((pg_temp.card(6)).nope_count::int, 1, 'T2 the nope is counted');
select is(pg_temp.has_entry('p1', 6), true, 'T2 the entry is restored for a nope');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();
select is(tests.vote('p1', 7, 'seen')->>'status', 'ok', 'T2 a seen on a removed card answers ok');
select is((pg_temp.card(7)).state::text, 'dropped', 'T2 under hide_seen the card is dropped');
select is(pg_temp.has_entry('p2', 7), false, 'T2 the card left p2''s deck, as usual');
select is(pg_temp.has_entry('p1', 7), true, 'T2 p1 keeps its voted entry');

-- T3: an offline vote with an old client time.
select tests.authenticate_as('p1');
select is(api.cast_vote(tests.room_id(), tests.film(8), 'like', null, null, now() - interval '3 days')->>'status',
  'ok', 'T3 an offline vote on a removed card answers ok');
select tests.clear_authentication();
select is((select v.client_created_at = r.started_at from public.votes v join public.rooms r on r.id = v.room_id
           where v.room_member_id = tests.member_id('p1') and v.title_id = tests.film(8)),
  true, 'T3 the client time is clamped to the start of the room');

-- T4: an active pool film never dealt to p1 (Q7.1).
select is(tests.vote('p1', 39, 'like')->>'status', 'ok', 'T4 a vote on a pool film never dealt to p1 is accepted');
select is(pg_temp.has_entry('p1', 39), true, 'T4 its entry is added');

-- T5: dropped stays dropped, and restores nothing.
update public.room_cards set state = 'dropped' where room_id = tests.room_id() and title_id = tests.film(9);
select is(tests.vote('p1', 9, 'like')->>'status', 'dropped', 'T5 a dropped card answers dropped');
select is(pg_temp.has_entry('p1', 9), false, 'T5 no entry is restored');

-- T6: a film outside the pool.
select tests.authenticate_as('p1');
select throws_ok(format('select api.cast_vote(%L, %L, ''like'')', tests.room_id(), tests.film(45)),
  '22023', 'card not in this room', 'T6 a film not in the pool raises 22023');
select tests.clear_authentication();

-- T7: a matched or finalist card with no entry still raises.
update public.room_cards set state = 'matched' where room_id = tests.room_id() and title_id = tests.film(13);
update public.room_cards set state = 'finalist' where room_id = tests.room_id() and title_id = tests.film(14);
select tests.authenticate_as('p1');
select throws_ok(format('select api.cast_vote(%L, %L, ''like'')', tests.room_id(), tests.film(13)),
  '22023', 'card was not dealt to this seat', 'T7 a matched card without an entry raises 22023');
select throws_ok(format('select api.cast_vote(%L, %L, ''like'')', tests.room_id(), tests.film(14)),
  '22023', 'card was not dealt to this seat', 'T7 a finalist card without an entry raises 22023');
select tests.clear_authentication();
select is(pg_temp.has_entry('p1', 13) or pg_temp.has_entry('p1', 14), false, 'T7 nothing is restored');

-- T8: no super likes left restores nothing.
update public.room_members set super_likes_left = 0 where id = tests.member_id('p1');
select is(tests.vote('p1', 10, 'super_like')->>'status', 'no_super_likes', 'T8 no super likes answers no_super_likes');
select is(pg_temp.has_entry('p1', 10), false, 'T8 no entry is restored');
update public.room_members set super_likes_left = 1 where id = tests.member_id('p1');

-- T9: a retry is a duplicate, with one vote and one entry.
select is(tests.vote('p1', 5, 'like')->>'status', 'duplicate', 'T9 a retry answers duplicate');
select is((select count(*) from public.votes where room_member_id = tests.member_id('p1') and title_id = tests.film(5)),
  1::bigint, 'T9 one vote');
select is((select count(*) from public.deck_entries where room_member_id = tests.member_id('p1') and title_id = tests.film(5)),
  1::bigint, 'T9 one entry');

-- T11: under deck_engine sql, a vote on a restored card at 16 remaining deals nothing.
select tests.use_deck_engine('sql');
select set_config('tests.entries_before', (select count(*)::text from public.deck_entries where room_member_id = tests.member_id('p1')), true);
select is(tests.vote('p1', 12, 'nope')->>'status', 'ok', 'T11 a vote on a restored card answers ok');
select is((select count(*) from public.deck_entries where room_member_id = tests.member_id('p1')),
  current_setting('tests.entries_before')::bigint + 1, 'T11 only the restored entry is added, no refill is dealt');
select is((select refill_requested_at is null from public.room_members where id = tests.member_id('p1')), true,
  'T11 no refill is requested');

-- T10 (last, because a match closes the room): p2 liked the film from its own deck, p1 likes the
-- restored card: the match rule sees both.
select tests.vote('p2', 11, 'like');
-- p2's first like propagates film 11 into p1's deck; take it out again to stand for the re-rank.
delete from public.deck_entries where room_member_id = tests.member_id('p1') and title_id = tests.film(11);
select is((tests.vote('p1', 11, 'like'))->>'match', 'true', 'T10 the match rule sees both likes');

select * from finish();
rollback;

-- M6.29: a seat with no card left is done (game-modes.md#how-a-game-ends "Running out of cards").
-- The SQL baseline is tried first; a seat it deals nothing is marked done, api.request_cards says
-- `done` with the room's liked count, an undo clears it, and the finale opens with reason
-- all_done when every present seat is done and a film has a like.

begin;
select plan(33);

select tests.create_catalog(25);
-- The seed's films would always give the baseline something to deal: switch them off here.
update public.titles set is_active = false where original_title not like 'Catalog Film %';

-- A swiping game of 25 films whose seats joined before the start; the SQL baseline deals the rest
-- (here nothing: the catalog is exactly the 25 films every seat holds).
create function pg_temp.game(p_players integer, p_prefix text) returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping');
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  update public.rooms set started_at = now() - interval '100 seconds' where id = tests.room_id();
  perform tests.use_deck_engine('sql');
end
$$;

-- As this player, answer films p_from to p_to with p_answer. Returns the last answer.
create function pg_temp.vote_range(p_name text, p_from integer, p_to integer, p_answer public.vote_answer default 'nope')
returns jsonb language plpgsql as $$
declare
  v jsonb;
  i integer;
begin
  for i in p_from..p_to loop
    v := tests.vote(p_name, i, p_answer);
  end loop;
  return v;
end $$;

-- A seat answers every film: the first p_likes as likes, the rest as nopes. Returns the last answer.
create function pg_temp.finish(p_name text, p_likes integer default 0) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  if p_likes > 0 then
    perform pg_temp.vote_range(p_name, 1, p_likes, 'like');
  end if;
  v := pg_temp.vote_range(p_name, p_likes + 1, 25, 'nope');
  return v;
end $$;

create function pg_temp.is_done(p_name text) returns boolean language sql as $$
  select m.done_at is not null from public.room_members m where m.id = tests.member_id(p_name)
$$;

create function pg_temp.room_state() returns text language sql as $$
  select r.state::text || '/' || coalesce(r.finale_reason::text, '-') from public.rooms r where r.id = tests.room_id()
$$;

create function pg_temp.request(p_name text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.request_cards(tests.room_id());
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.undo(p_name text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.undo_last_vote(tests.room_id());
  perform tests.clear_authentication();
  return v;
end $$;

-- 1. Answering the last card with nothing left to deal marks the seat done.
select pg_temp.game(2, 'a');
select pg_temp.vote_range('a1', 1, 24);
select is(pg_temp.is_done('a1'), false, 'M6.29 positive control: a seat with one card left is not done');
select tests.vote('a1', 25, 'nope');
select is(pg_temp.is_done('a1'), true, 'M6.29 a seat answering its last card with no film left to deal is done');
select is(pg_temp.is_done('a2'), false, 'M6.29 the other seat is not done');

-- 6. An undo that gives a done seat a card back clears done_at.
select is(pg_temp.undo('a1')->>'status', 'ok', 'M6.29 positive control: the undo works');
select is(pg_temp.is_done('a1'), false, 'M6.29 undoing the last vote of a done seat clears done_at');

-- 4. A done seat asking for cards hears `done` with the room's liked films (a dropped one not counted).
select pg_temp.game(2, 'b');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();
select tests.vote('b2', 3, 'like');
select pg_temp.vote_range('b1', 1, 2, 'like');
select tests.vote('b1', 3, 'seen');
select pg_temp.vote_range('b1', 4, 25);
select is(pg_temp.is_done('b1'), true, 'M6.29 positive control: the seat is done');
select is(
  (select c.state::text from public.room_cards c where c.room_id = tests.room_id() and c.title_id = tests.film(3)),
  'dropped',
  'M6.29 positive control: film 3 was dropped by a "Seen it"'
);
select is(
  pg_temp.request('b1'),
  jsonb_build_object('status', 'done', 'liked', 2),
  'M6.29 a done seat gets done with the films the room liked, a dropped film not counted'
);
select is(pg_temp.request('b2')->>'status', 'enough', 'M6.29 a seat with cards left still hears enough');

-- 5. A seat with cards left is not done, however empty the baseline.
select pg_temp.game(2, 'c');
select is(pg_temp.request('c1'), jsonb_build_object('status', 'enough', 'remaining', 25), 'M6.29 25 cards left: enough');
select pg_temp.vote_range('c1', 1, 22);
select is(pg_temp.request('c1')->>'status', 'ok', 'M6.29 3 cards left and nothing to deal: the answer is ok, as before');
select is(pg_temp.is_done('c1'), false, 'M6.29 3 cards left: not done');

-- 3. Under the server engine a queued refill holds done back until the baseline runs and deals nothing.
select pg_temp.game(2, 'd');
select tests.use_deck_engine('server');
select pg_temp.vote_range('d1', 1, 25);
select is(pg_temp.is_done('d1'), false, 'M6.29 with a refill queued under the server engine, the seat is not done');
select is(pg_temp.request('d1')->>'status', 'queued', 'M6.29 positive control: the refill is still queued');
update public.room_members set refill_requested_at = now() - interval '9 seconds' where id = tests.member_id('d1');
select is(
  pg_temp.request('d1'),
  jsonb_build_object('status', 'done', 'liked', 0),
  'M6.29 after 8 seconds the baseline runs, deals nothing, and the seat is done'
);
select is(pg_temp.is_done('d1'), true, 'M6.29 done_at is set once the baseline dealt nothing');

-- 7. Two present seats: one done is no finale; the second done with a film liked opens it.
select pg_temp.game(2, 'e');
select pg_temp.finish('e1', 2);
select is(pg_temp.room_state(), 'swiping/-', 'M6.29 positive control: one seat done is no finale');
select pg_temp.vote_range('e2', 1, 24);
select is(pg_temp.room_state(), 'swiping/-', 'M6.29 positive control: a seat with a card left holds the finale up');
create temp table v_e as select tests.vote('e2', 25, 'nope') as a;
select is(pg_temp.room_state(), 'finale/all_done', 'M6.29 every present seat done and a film liked: the finale opens with reason all_done');
select ok((select a ? 'finale_round_id' from v_e), 'M6.29 the vote that opened it answers with the round');

-- 8. Nothing liked: the room stays swiping.
select pg_temp.game(2, 'f');
select pg_temp.finish('f1');
select pg_temp.finish('f2');
select is(pg_temp.is_done('f1') and pg_temp.is_done('f2'), true, 'M6.29 positive control: both seats are done');
select is(pg_temp.room_state(), 'swiping/-', 'M6.29 every present seat done and nothing liked: no finale, the room stays swiping');

-- 9. A silent seat that is not done does not hold it up.
select pg_temp.game(3, 'g');
update public.room_members set last_active_at = now() - interval '120 seconds' where id = tests.member_id('g3');
select pg_temp.finish('g1', 2);
select is(pg_temp.room_state(), 'swiping/-', 'M6.29 positive control: one of two present seats done');
select pg_temp.finish('g2');
select is(pg_temp.room_state(), 'finale/all_done', 'M6.29 a seat silent for 90 seconds, not done, does not hold up everyone done');

-- 10. A late joiner who is present holds it up, unlike the card count.
select pg_temp.game(3, 'h');
update public.room_members set joined_at = now() where id = tests.member_id('h3');
select pg_temp.finish('h1', 2);
select pg_temp.finish('h2');
select is(pg_temp.room_state(), 'swiping/-', 'M6.29 a present late joiner who is not done holds up everyone done');
select pg_temp.finish('h3');
select is(pg_temp.room_state(), 'finale/all_done', 'M6.29 positive control: once the late joiner is done too, the finale opens');

-- 11. The card count reached on the same vote wins.
select pg_temp.game(2, 'i');
select pg_temp.finish('i1', 2);
select pg_temp.vote_range('i2', 1, 24);
update public.room_members set swipe_count = 40 where id = tests.member_id('i1');
update public.room_members set swipe_count = 39 where id = tests.member_id('i2');
select tests.vote('i2', 25, 'nope');
select is(pg_temp.room_state(), 'finale/cards', 'M6.29 the card count reached on the same vote gives the reason cards');

-- Finding 5: the answer of a vote that ends the room carries the room state.
select pg_temp.game(2, 'j');
select pg_temp.finish('j1', 1);
create temp table v_j as select pg_temp.finish('j2') as a;
select is(
  (select a->>'state' from v_j) || '/' || pg_temp.room_state(),
  'done/done/all_done',
  'M6.29 a vote that ended the room with one liked film answers with the room state'
);
select is((select a->>'status' from v_j), 'ok', 'M6.29 and it is still an ok answer');

select pg_temp.game(2, 'k');
select pg_temp.finish('k1', 2);
create temp table v_k as select pg_temp.finish('k2') as a;
select is((select a->>'state' from v_k), 'finale', 'M6.29 a vote that opened the finale answers with the state finale');

select pg_temp.game(2, 'l');
select is(tests.vote('l1', 1, 'like') ? 'state', false, 'M6.29 a vote while the room is swiping carries no state');

-- 2. The baseline still has films: the seat gets cards and is not done. Last, since it adds films.
select tests.create_catalog(30);
select pg_temp.game(2, 'm');
select pg_temp.vote_range('m1', 1, 25);
select is(pg_temp.is_done('m1'), false, 'M6.29 a seat answering its last card when the baseline still has films is not done');
select ok(cardinality(tests.upcoming('m1')) > 0, 'M6.29 and it was dealt new cards');

select * from finish();
rollback;

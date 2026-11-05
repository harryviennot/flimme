-- M6.41: My films in user_titles (solo-and-my-films.md sections 6, 7 and 10, privacy.md "Film history").
-- A like, a super like and a group's pick land in the player's own film history; undo takes a like
-- back; api.my_films lists Liked and Seen; api.my_film_card, api.set_film_seen and
-- api.remove_my_film read and edit the caller's own rows; the export carries the new columns;
-- deleting the account deletes the rows; retention never touches them.
-- The catalog holds exactly 25 films, so a fresh solo player is dealt all of them.

begin;
select plan(101);

select tests.create_catalog(40);
update public.titles set is_active = false where original_title not like 'Catalog Film %';
-- Every mode picks at its first match (as 580 does), except the solo row, which has no matching.
update public.game_modes set defaults = defaults || '{"matches_to_end": 1}' where slug <> 'solo';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function pg_temp.player(p text) returns void language plpgsql as $$
begin
  perform tests.create_player(p);
  insert into public.profile_providers (profile_id, provider_id) values (tests.uid(p), 9001);
end $$;

create function pg_temp.solo(p text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.start_solo();
  perform tests.clear_authentication();
  if v->>'room_id' is not null then
    perform set_config('tests.room_id', v->>'room_id', true);
  end if;
  return v;
end $$;

-- As this player, api.cast_vote on a title id in the last room.
create function pg_temp.vote_t(p text, t bigint, a public.vote_answer) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.cast_vote(tests.room_id(), t, a);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.undo(p text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.undo_last_vote(tests.room_id());
  perform tests.clear_authentication();
  return v;
end $$;

-- A column of the player's user_titles row (null when there is no row or the column is null).
create function pg_temp.col(p text, t bigint, s text, c text) returns text language sql as $$
  select to_jsonb(ut)->>c from public.user_titles ut
  where ut.profile_id = tests.uid(p) and ut.title_id = t and ut.source = s::public.title_fact_source
$$;
create function pg_temp.has(p text, t bigint, s text) returns boolean language sql as $$
  select exists (select 1 from public.user_titles ut
                 where ut.profile_id = tests.uid(p) and ut.title_id = t and ut.source = s::public.title_fact_source)
$$;

-- A user_titles fixture row.
create function pg_temp.fix(p text, t bigint, s text, p_liked interval default null, p_super boolean default false,
                            p_picked interval default null, p_seen interval default null,
                            p_seen_flag boolean default false, p_updated interval default null)
returns void language sql as $$
  insert into public.user_titles (profile_id, title_id, source, seen, super_liked, liked_at, picked_at, seen_at, updated_at)
  values (tests.uid(p), t, s::public.title_fact_source, p_seen_flag or p_seen is not null, p_super,
          now() - p_liked, now() - p_picked, now() - p_seen, now() - coalesce(p_updated, p_liked, p_picked, p_seen, interval '0'))
$$;

create function pg_temp.films(p text, seg text, flt text default 'all', cur text default null) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.my_films(seg, flt, cur);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.ids(j jsonb) returns bigint[] language sql as $$
  select coalesce(array_agg((f->>'title_id')::bigint order by o), '{}')
  from jsonb_array_elements(j->'films') with ordinality x(f, o)
$$;

create function pg_temp.tile(j jsonb, t bigint) returns jsonb language sql as $$
  select f from jsonb_array_elements(j->'films') f where (f->>'title_id')::bigint = t
$$;

-- What the player's rows say about reading other people's rows: -1 when the read is refused.
create function pg_temp.reads(p text, owner text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.authenticate_as(p);
  begin
    execute format('select count(*) from public.user_titles where profile_id = %L', tests.uid(owner)) into n;
  exception when insufficient_privilege then
    n := -1;
  end;
  perform tests.clear_authentication();
  return n;
end $$;

create function pg_temp.card(p text, t bigint) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.my_film_card(t);
  perform tests.clear_authentication();
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Solo rooms (the SQL engine deals them whole)
-- ---------------------------------------------------------------------------
select tests.use_deck_engine('sql');
select pg_temp.player('s1');
select pg_temp.player('s2');
select is(pg_temp.solo('s1')->>'status', 'ok', 'a solo room opens for s1');
select set_config('tests.s1_room', tests.room_id()::text, true);
select set_config('tests.s1_films', (tests.upcoming('s1'))::text, true);

create function pg_temp.sf(n integer) returns bigint language sql as $$
  select (current_setting('tests.s1_films')::bigint[])[n]
$$;

select pg_temp.vote_t('s1', pg_temp.sf(1), 'like');
select pg_temp.vote_t('s1', pg_temp.sf(2), 'super_like');
select pg_temp.vote_t('s1', pg_temp.sf(3), 'nope');
select pg_temp.vote_t('s1', pg_temp.sf(4), 'seen');

-- 1. Where a like lands: the room's source.
select ok(pg_temp.col('s1', pg_temp.sf(1), 'solo', 'liked_at') is not null
          and not pg_temp.has('s1', pg_temp.sf(1), 'app'),
          'M6.41 rule 1: a like in a solo room writes liked_at on the solo row, not the app row');
select is(pg_temp.col('s1', pg_temp.sf(1), 'solo', 'super_liked'), 'false', 'M6.41 rule 1: a plain like is not a super like');
select ok(pg_temp.col('s1', pg_temp.sf(2), 'solo', 'liked_at') is not null
          and pg_temp.col('s1', pg_temp.sf(2), 'solo', 'super_liked') = 'true',
          'M6.41 rule 1: a super like in a solo room sets super_liked and liked_at');
select ok(not pg_temp.has('s1', pg_temp.sf(3), 'solo') and not pg_temp.has('s1', pg_temp.sf(3), 'app'),
          'M6.41 rule 1: a nope writes nothing');
select ok(pg_temp.col('s1', pg_temp.sf(4), 'app', 'seen') = 'true'
          and pg_temp.col('s1', pg_temp.sf(4), 'app', 'seen_at') is not null
          and not pg_temp.has('s1', pg_temp.sf(4), 'solo'),
          'M6.41 rule 2: Seen it in a solo room writes the app row, with seen_at');

-- A solo pick sets no picked_at (rule 4).
select is(
  (select (a.r->>'status') from (select (tests.authenticate_as('s1')) x, api.solo_pick(tests.room_id(), pg_temp.sf(1)) r) a),
  'ok', 'the solo pick is recorded');
select tests.clear_authentication();
select is((select count(*) from public.user_titles where profile_id = tests.uid('s1') and picked_at is not null), 0::bigint,
          'M6.41 rule 4: a solo pick sets no picked_at');

-- The player leaves, so the next solo room can open.
select tests.authenticate_as('s1');
select api.leave_room(tests.room_id());
select tests.clear_authentication();

-- 7 (rule 6). Films in My films are not dealt to a new solo room, though nothing was voted on them.
select pg_temp.fix('s1', pg_temp.sf(5), 'solo', p_liked => interval '2 days');
select pg_temp.fix('s1', pg_temp.sf(6), 'app', p_picked => interval '2 days');
select pg_temp.fix('s1', pg_temp.sf(7), 'app', p_liked => interval '2 days');   -- liked in a group room: a solo deck still skips it
select is(pg_temp.solo('s1')->>'status', 'ok', 'a second solo room opens for s1');
select set_config('tests.s1b_room', tests.room_id()::text, true);
select ok(not exists (select 1 from public.room_cards c where c.room_id = current_setting('tests.s1b_room')::uuid
                      and c.title_id in (pg_temp.sf(5), pg_temp.sf(6), pg_temp.sf(7)))
          and exists (select 1 from public.room_cards c where c.room_id = current_setting('tests.s1b_room')::uuid),
          'M6.41 rule 6: a solo deck leaves out films with liked_at or picked_at in any of the player''s rows');
select ok(not exists (select 1 from public.room_cards c where c.room_id = current_setting('tests.s1b_room')::uuid
                      and c.title_id in (pg_temp.sf(1), pg_temp.sf(2), pg_temp.sf(3), pg_temp.sf(4))),
          'M6.40 still holds: films answered in the earlier solo room are not dealt');
select is(pg_temp.solo('s2')->>'status', 'ok', 's2 opens a solo room');
select is((select count(*) from public.room_cards c where c.room_id = tests.room_id()
           and c.title_id in (pg_temp.sf(5), pg_temp.sf(6), pg_temp.sf(7))), 3::bigint,
          'M6.41 rule 6: another player is still dealt those films');
select set_config('tests.room_id', current_setting('tests.s1b_room'), true);
select is(pg_temp.vote_t('s1', (select (array_agg(x.id))[1] from (select unnest(tests.upcoming('s1')) id) x), 'like')->>'status', 'ok',
          'the second solo room takes a like');
select is((select count(*) from public.user_titles where on_watchlist), 0::bigint,
          'M6.41 rule 5: nothing sets on_watchlist');

-- ---------------------------------------------------------------------------
-- A group room: where likes land, and undo
-- ---------------------------------------------------------------------------
select tests.deal_game(3, 'a');
select set_config('tests.room_a', tests.room_id()::text, true);
update public.rooms set seen_rule = 'allow_rewatch' where id = tests.room_id();

select tests.vote('a1', 1, 'like');
select tests.vote('a1', 2, 'super_like');
select tests.vote('a1', 3, 'nope');
select tests.vote('a1', 4, 'seen');
select tests.vote('a1', 5, 'seen_rewatch');

select ok(pg_temp.col('a1', tests.film(1), 'app', 'liked_at') is not null
          and pg_temp.col('a1', tests.film(1), 'app', 'super_liked') = 'false'
          and not pg_temp.has('a1', tests.film(1), 'solo'),
          'M6.41 rule 1: a like in a group room writes liked_at on the app row');
select ok(pg_temp.col('a1', tests.film(2), 'app', 'liked_at') is not null
          and pg_temp.col('a1', tests.film(2), 'app', 'super_liked') = 'true',
          'M6.41 rule 1: a super like sets super_liked');
select ok(not pg_temp.has('a1', tests.film(3), 'app'), 'M6.41 rule 1: a nope writes nothing');
select ok(pg_temp.col('a1', tests.film(4), 'app', 'seen') = 'true'
          and pg_temp.col('a1', tests.film(4), 'app', 'seen_at') is not null
          and pg_temp.col('a1', tests.film(4), 'app', 'liked_at') is null,
          'M6.41 rule 2: Seen it writes the app row with seen_at and no like');
select ok(pg_temp.col('a1', tests.film(5), 'app', 'liked_at') is not null
          and pg_temp.col('a1', tests.film(5), 'app', 'seen') = 'true'
          and pg_temp.col('a1', tests.film(5), 'app', 'seen_at') is not null,
          'M6.41 rule 1: seen_rewatch sets liked_at and the seen mark');
select ok(pg_temp.col('a1', tests.film(1), 'app', 'updated_at') is not null
          and (select count(*) from public.user_titles where profile_id = tests.uid('a2')) = 0,
          'M6.41 rule 12: other seats of the room get nothing from a1''s votes');

-- 2 and 3. Undo.
-- A seen it, undone: the row had nothing else, so it goes.
select pg_temp.undo('a1');
-- (the vote above was seen_rewatch on film 5: both marks go with it)
select ok(not pg_temp.has('a1', tests.film(5), 'app'),
          'M6.41 rule 3: undoing seen_rewatch removes the seen mark and the like, and the empty row goes');

-- A like, undone: the row goes.
select tests.vote('a1', 9, 'like');
select pg_temp.undo('a1');
select ok(not pg_temp.has('a1', tests.film(9), 'app'),
          'M6.41 rule 3: undoing a like clears liked_at and deletes the row left with nothing');

-- A like on a film liked in an earlier room: the first liked_at stays, and so does it after undo.
select pg_temp.fix('a1', tests.film(7), 'app', p_liked => interval '3 days');
select set_config('tests.liked7', pg_temp.col('a1', tests.film(7), 'app', 'liked_at'), true);
select tests.vote('a1', 7, 'like');
select is(pg_temp.col('a1', tests.film(7), 'app', 'liked_at'), current_setting('tests.liked7'),
          'M6.41 rule 2: liking again keeps the first liked_at');
select pg_temp.undo('a1');
select is(pg_temp.col('a1', tests.film(7), 'app', 'liked_at'), current_setting('tests.liked7'),
          'M6.41 rule 3: undoing the second like leaves the first liked_at');

-- A super like on a film liked earlier: undo takes the star back, not the like.
select pg_temp.fix('a1', tests.film(8), 'app', p_liked => interval '3 days');
select tests.vote('a1', 8, 'super_like');
select is(pg_temp.col('a1', tests.film(8), 'app', 'super_liked'), 'true', 'a super like on a liked film sets the star');
select pg_temp.undo('a1');
select ok(pg_temp.col('a1', tests.film(8), 'app', 'super_liked') = 'false'
          and pg_temp.col('a1', tests.film(8), 'app', 'liked_at') is not null,
          'M6.41 rule 3: undoing a super like clears super_liked and keeps liked_at');

-- A like on a row that holds a rating: undo keeps the row.
insert into public.user_titles (profile_id, title_id, source, rating) values (tests.uid('a1'), tests.film(10), 'app', 4);
select tests.vote('a1', 10, 'like');
select pg_temp.undo('a1');
select ok(pg_temp.col('a1', tests.film(10), 'app', 'liked_at') is null and pg_temp.col('a1', tests.film(10), 'app', 'rating') = '4.0',
          'M6.41 rule 3: undoing a like keeps a row that holds a rating');

-- A super like on a film whose star is already there from a super like in another (finished) room:
-- undo keeps the star. The other room is a fixture: a seat of a1's that left, with a super like on a card.
insert into public.rooms (code, host_id, mode, country, max_players, state)
select '987654', tests.uid('a1'), 'quick_match', 'FR', 10, 'done';
insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key, left_at)
select r.id, tests.uid('a1'), tests.uid('a1'), 'guest', 'a1', 'a1', now() from public.rooms r where r.code = '987654';
insert into public.room_cards (room_id, title_id, group_score)
select r.id, tests.film(11), 3 from public.rooms r where r.code = '987654';
insert into public.votes (room_id, room_member_id, title_id, answer)
select r.id, m.id, tests.film(11), 'super_like' from public.rooms r join public.room_members m on m.room_id = r.id where r.code = '987654';
select pg_temp.fix('a1', tests.film(11), 'app', p_liked => interval '3 days', p_super => true);
select tests.vote('a1', 11, 'super_like');
select pg_temp.undo('a1');
select ok(pg_temp.col('a1', tests.film(11), 'app', 'liked_at') is not null
          and pg_temp.col('a1', tests.film(11), 'app', 'super_liked') = 'true',
          'M6.41 rule 3: undoing a super like keeps the star another room''s super like gave');

-- 4. Seen ... covered above. A first-time seen it, then undo: the row goes (rule 3, existing behaviour).
select tests.vote('a1', 12, 'seen');
select pg_temp.undo('a1');
select ok(not pg_temp.has('a1', tests.film(12), 'app'), 'M6.41 rule 3: undoing Seen it deletes a row with nothing else');

-- The room carries nothing of the like (rules 5 and 6).
select tests.authenticate_as('a1');
select set_config('tests.a_cards', (api.my_next_cards(tests.room_id()))::text || (api.title_cards(tests.room_id(), array[tests.film(1)]))::text, true);
select tests.clear_authentication();
select ok(current_setting('tests.a_cards') !~ '(liked_at|super_liked|picked_at)',
          'M6.41 rule 5: api.my_next_cards and api.title_cards carry no field from a like');

-- ---------------------------------------------------------------------------
-- A group's pick (rule 4)
-- ---------------------------------------------------------------------------
-- Through the real match path: matches_to_end 1, two players like the same film.
select tests.deal_game(2, 'q');
select tests.vote('q1', 1, 'like');
select tests.vote('q2', 1, 'like');
select ok(exists (select 1 from public.matches where room_id = tests.room_id() and pick_order = 1),
          'the match made the pick (matches_to_end 1)');
select ok(pg_temp.col('q1', tests.film(1), 'app', 'picked_at') is not null
          and pg_temp.col('q2', tests.film(1), 'app', 'picked_at') is not null
          and pg_temp.col('q1', tests.film(1), 'app', 'liked_at') is not null,
          'M6.41 rule 4: a pick by match gives every seated profile picked_at on its app row');

-- Through a direct write to matches (insert, then update to pick 1): the finale paths do one of these.
select tests.deal_game(4, 'r');
update public.room_members set left_at = now() where id = tests.member_id('r3');
update public.room_members set left_at = now(), removed_at = now() where id = tests.member_id('r2');
insert into public.matches (room_id, title_id, kind, like_count, present_count)
values (tests.room_id(), tests.film(1), 'majority', 2, 2);
select is((select count(*) from public.user_titles where profile_id = tests.uid('r1') and picked_at is not null), 0::bigint,
          'M6.41 rule 4: a match that is not the pick sets nothing');
update public.matches set pick_order = 1 where room_id = tests.room_id() and title_id = tests.film(1);
select ok(pg_temp.col('r1', tests.film(1), 'app', 'picked_at') is not null
          and pg_temp.col('r4', tests.film(1), 'app', 'picked_at') is not null
          and pg_temp.col('r1', tests.film(1), 'app', 'liked_at') is null,
          'M6.41 rule 4: a pick without your like still marks the film picked for you');
select ok(not pg_temp.has('r3', tests.film(1), 'app') and not pg_temp.has('r2', tests.film(1), 'app'),
          'M6.41 rule 4: a seat that left before the pick and a removed seat get none');

-- A pick on an insert with pick_order 1 (as the finale does), in a room of its own.
select tests.deal_game(2, 'u');
insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
values (tests.room_id(), tests.film(2), 'finale', 2, 2, 1);
select ok(pg_temp.col('u1', tests.film(2), 'app', 'picked_at') is not null
          and pg_temp.col('u2', tests.film(2), 'app', 'picked_at') is not null,
          'M6.41 rule 4: a match inserted as the pick marks every seat');
select ok(pg_temp.col('u1', tests.film(2), 'solo', 'picked_at') is null and not pg_temp.has('u1', tests.film(2), 'solo'),
          'M6.41 rule 4: a group pick writes the app row only');

-- ---------------------------------------------------------------------------
-- Group decks: a liked or picked film can be dealt (rule 6) and nothing reads a like (rule 5)
-- ---------------------------------------------------------------------------
select tests.deal_game(2, 'g', 'lobby');
select set_config('tests.room_g', tests.room_id()::text, true);
select pg_temp.fix('g1', tests.film(33), 'app', p_liked => interval '1 day');
select pg_temp.fix('g1', tests.film(34), 'app', p_picked => interval '1 day');
select pg_temp.fix('g1', tests.film(35), 'solo', p_liked => interval '1 day', p_super => true);
select ok(exists (select 1 from internal.deck_candidates(tests.room_id()) c where c.title_id = tests.film(33))
          and exists (select 1 from internal.deck_candidates(tests.room_id()) c where c.title_id = tests.film(34))
          and exists (select 1 from internal.deck_candidates(tests.room_id()) c where c.title_id = tests.film(35)),
          'M6.41 rule 6: a group deck still deals films that are in My films');
select is((select coalesce(sum(c.watchlist_count), 0) from internal.deck_candidates(tests.room_id()) c), 0::bigint,
          'M6.41 rule 5: likes and picks never count as a watchlist in the deck');

-- ---------------------------------------------------------------------------
-- api.my_films
-- ---------------------------------------------------------------------------
select pg_temp.player('f1');
select pg_temp.player('f2');
-- A liked, B solo liked, C picked only, D liked in both (star on the solo one), E liked+star+picked.
select pg_temp.fix('f1', tests.film(1), 'app', p_liked => interval '5 days');
select pg_temp.fix('f1', tests.film(2), 'solo', p_liked => interval '4 days');
select pg_temp.fix('f1', tests.film(3), 'app', p_picked => interval '3 days');
select pg_temp.fix('f1', tests.film(4), 'app', p_liked => interval '6 days');
select pg_temp.fix('f1', tests.film(4), 'solo', p_liked => interval '2 days', p_super => true);
select pg_temp.fix('f1', tests.film(5), 'app', p_liked => interval '7 days', p_super => true, p_picked => interval '1 day');
-- Seen: G app with seen_at, H solo without seen_at (updated_at counts), a calibration seen, a solo-only like.
select pg_temp.fix('f1', tests.film(6), 'app', p_seen => interval '8 days');
select pg_temp.fix('f1', tests.film(7), 'solo', p_seen_flag => true, p_updated => interval '36 hours');
select pg_temp.fix('f1', tests.film(8), 'calibration', p_seen_flag => true, p_updated => interval '1 hour');
-- Another player's likes never show up.
select pg_temp.fix('f2', tests.film(9), 'app', p_liked => interval '1 day');

select is(pg_temp.films('f1', 'liked')->>'status', 'ok', 'my_films answers ok');
select is(pg_temp.ids(pg_temp.films('f1', 'liked')), array[tests.film(5), tests.film(4), tests.film(3), tests.film(2), tests.film(1)],
          'M6.41 rule 7: All lists every liked film and a pick, one tile per film, newest first');
select is(pg_temp.ids(pg_temp.films('f1', 'liked', 'friends')), array[tests.film(5), tests.film(3), tests.film(1), tests.film(4)],
          'M6.41 rule 7: With friends lists app rows with a like or a pick, a pick without a like included');
select is(pg_temp.ids(pg_temp.films('f1', 'liked', 'solo')), array[tests.film(4), tests.film(2)],
          'M6.41 rule 7: Solo lists solo rows with a like');
select ok((pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(5))->>'is_picked')::boolean
          and (pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(5))->>'is_super_liked')::boolean
          and not (pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(1))->>'is_picked')::boolean
          and not (pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(1))->>'is_super_liked')::boolean
          and (pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(4))->>'is_super_liked')::boolean
          and (pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(3))->>'is_picked')::boolean,
          'M6.41 rule 7: is_picked and is_super_liked are right on the tiles');
select ok(pg_temp.tile(pg_temp.films('f1', 'liked'), tests.film(1)) ?& array['title_id', 'title', 'year', 'poster_path', 'is_picked', 'is_super_liked', 'at'],
          'M6.41 contract: a tile carries title_id, title, year, poster_path, is_picked, is_super_liked and at');
select is(pg_temp.films('f1', 'liked')->'next_cursor', 'null'::jsonb, 'the last page has a null cursor');
select is(pg_temp.ids(pg_temp.films('f1', 'seen')), array[tests.film(7), tests.film(6)],
          'M6.41 rules 8 and 9: Seen lists app and solo seen rows only, newest first by coalesce(seen_at, updated_at)');
select ok(not (tests.film(8) = any (pg_temp.ids(pg_temp.films('f1', 'seen')))),
          'M6.41 rule 8: a calibration row is never listed');
select is(pg_temp.ids(pg_temp.films('f2', 'liked')), array[tests.film(9)],
          'M6.41 rule 12: another profile''s rows never appear');
select ok(pg_temp.reads('f2', 'f1') <= 0, 'M6.41: another player can read none of your user_titles rows');
select throws_ok($$ select pg_temp.films('f1', 'nope') $$, '22023', null, 'a bad segment raises 22023');
select throws_ok($$ select pg_temp.films('f1', 'liked', 'everyone') $$, '22023', null, 'a bad filter raises 22023');
select throws_ok($$ select pg_temp.films('f1', 'liked', 'all', 'garbage') $$, '22023', null, 'a bad cursor raises 22023');

update public.profiles set last_seen_at = now() - interval '80 days' where id = tests.uid('f1');
select pg_temp.films('f1', 'liked');
select ok((select p.last_seen_at > now() - interval '1 minute' from public.profiles p where p.id = tests.uid('f1')),
          'M6.41 rule 13: browsing My films moves last_seen_at');

-- Paging: 70 solo likes, pairs sharing a time, 60 a page, every film once.
select pg_temp.player('pg');
create function pg_temp.fill() returns void language plpgsql as $$
declare t bigint; i integer;
begin
  for i in 1..70 loop
    t := tests.create_title('Paging Film ' || lpad(i::text, 3, '0'));
    insert into public.user_titles (profile_id, title_id, source, liked_at)
    values (tests.uid('pg'), t, 'solo', now() - ((i / 2) * interval '1 minute'));
  end loop;
end $$;
select pg_temp.fill();
create temp table page1 as select pg_temp.films('pg', 'liked', 'solo') j;
select is(jsonb_array_length((select j->'films' from page1)), 60, 'M6.41 rule 7: a page holds 60 films');
select ok((select j->>'next_cursor' from page1) is not null, 'a full page comes with a cursor');
create temp table page2 as select pg_temp.films('pg', 'liked', 'solo', (select j->>'next_cursor' from page1)) j;
select is(jsonb_array_length((select j->'films' from page2)), 10, 'the second page holds the rest');
select ok((select j->'next_cursor' from page2) = 'null'::jsonb, 'the last page has no cursor');
select is((select count(distinct t) from (
             select (f->>'title_id')::bigint t from page1, jsonb_array_elements(j->'films') f
             union all
             select (f->>'title_id')::bigint from page2, jsonb_array_elements(j->'films') f) x), 70::bigint,
          'M6.41 rule 7: paging with the cursor returns every film once, ties included');

-- ---------------------------------------------------------------------------
-- set_film_seen and remove_my_film
-- ---------------------------------------------------------------------------
-- Rule 9: clearing a seen mark brings the film back to decks.
select pg_temp.fix('g1', tests.film(19), 'app', p_seen => interval '1 day');
select ok(not exists (select 1 from internal.deck_candidates(current_setting('tests.room_g')::uuid) c where c.title_id = tests.film(19)),
          'a seen film is not dealt');
select tests.authenticate_as('g1');
select is(api.set_film_seen(tests.film(19), false)->>'status', 'ok', 'set_film_seen(false) answers ok');
select tests.clear_authentication();
select ok(exists (select 1 from internal.deck_candidates(current_setting('tests.room_g')::uuid) c where c.title_id = tests.film(19)),
          'M6.41 rule 9: after Not seen, a later room can deal the film');
select ok(not pg_temp.has('g1', tests.film(19), 'app'), 'M6.41 rule 9: a row left with nothing is deleted');
select tests.authenticate_as('g1');
select is(api.set_film_seen(tests.film(19), false)->>'status', 'not_found', 'Not seen again answers not_found');
select tests.clear_authentication();

-- Rule 9: Letterboxd and calibration rows are untouched by set_film_seen(false).
select pg_temp.fix('f1', tests.film(8), 'app', p_seen_flag => true);
select tests.authenticate_as('f1');
select api.set_film_seen(tests.film(8), false);
select tests.clear_authentication();
select ok(pg_temp.col('f1', tests.film(8), 'calibration', 'seen') = 'true' and not pg_temp.has('f1', tests.film(8), 'app'),
          'M6.41 rule 9: set_film_seen(false) leaves other sources alone');

-- Mark as seen: only for a film in the caller's rows.
select tests.authenticate_as('f1');
select is(api.set_film_seen(tests.film(1), true)->>'status', 'ok', 'Mark as seen on a liked film answers ok');
select is(api.set_film_seen(tests.film(13), true)->>'status', 'not_found', 'M6.41 rule 9: a film not in the caller''s rows answers not_found');
select tests.clear_authentication();
select ok(pg_temp.col('f1', tests.film(1), 'app', 'seen') = 'true' and pg_temp.col('f1', tests.film(1), 'app', 'seen_at') is not null
          and pg_temp.col('f1', tests.film(1), 'app', 'liked_at') is not null,
          'M6.41 rule 9: the app row has seen and seen_at, and keeps its like');
select ok(not pg_temp.has('f1', tests.film(13), 'app'), 'a refused Mark as seen creates no row');

-- Remove: clears the like and the pick, keeps seen, never touches votes.
select count(*) as votes_before from public.votes where room_id = current_setting('tests.room_a')::uuid \gset
select tests.authenticate_as('a1');
select is(api.remove_my_film(tests.film(2))->>'status', 'ok', 'Remove answers ok');
select tests.clear_authentication();
select ok(not pg_temp.has('a1', tests.film(2), 'app'), 'M6.41 rule 10: Remove deletes a row left with nothing');
select tests.authenticate_as('f1');
select api.remove_my_film(tests.film(5));
select tests.clear_authentication();
select ok(not pg_temp.has('f1', tests.film(5), 'app'), 'M6.41 rule 10: Remove clears the like, the star and the pick');
select tests.authenticate_as('f1');
select api.remove_my_film(tests.film(1));
select tests.clear_authentication();
select ok(pg_temp.col('f1', tests.film(1), 'app', 'liked_at') is null and pg_temp.col('f1', tests.film(1), 'app', 'seen') = 'true',
          'M6.41 rule 10: Remove keeps the seen mark');
select tests.authenticate_as('f1');
select is(api.remove_my_film(tests.film(1))->>'status', 'not_found', 'M6.41 rule 10: Remove a second time answers not_found');
select tests.clear_authentication();
select is((select count(*) from public.votes where room_id = current_setting('tests.room_a')::uuid), :votes_before::bigint,
          'M6.41 rule 10: Remove never changes a game''s votes');
select ok(pg_temp.col('f1', tests.film(4), 'solo', 'liked_at') is not null,
          'Remove on another film leaves f1''s other rows');
select tests.authenticate_as('f1');
select api.remove_my_film(tests.film(4));
select tests.clear_authentication();
select ok(not pg_temp.has('f1', tests.film(4), 'app') and not pg_temp.has('f1', tests.film(4), 'solo'),
          'M6.41 rule 10: Remove clears the app and the solo row');

-- ---------------------------------------------------------------------------
-- api.my_film_card
-- ---------------------------------------------------------------------------
select tests.create_provider(9002, 'Other Service');
insert into public.title_availability (title_id, country, provider_id, kind)
values (tests.film(3), 'FR', 9002, 'subscription') on conflict do nothing;
select is(pg_temp.card('f1', tests.film(3))->>'status', 'ok', 'my_film_card answers ok for a film in the caller''s rows');
select is(pg_temp.card('f1', tests.film(3))#>>'{card,title_id}', tests.film(3)::text, 'the card is the film''s card');
select ok(pg_temp.card('f1', tests.film(3)) ? 'seen' and pg_temp.card('f1', tests.film(3)) ? 'liked',
          'M6.41 contract: ok carries seen and liked next to the card');
select is(pg_temp.card('f1', tests.film(3))->>'liked', 'true', 'a pick counts as liked for the sheet');
select is(pg_temp.card('f1', tests.film(7))->>'seen', 'true', 'a seen film says seen');
select is(pg_temp.card('f1', tests.film(7))->>'liked', 'false', 'a seen film that was never liked says not liked');
select is((select jsonb_agg(x->>'provider_id' order by x->>'provider_id')
           from jsonb_array_elements(pg_temp.card('f1', tests.film(3))#>'{card,providers}') x),
          '["9001"]'::jsonb, 'M6.41 rule 11: the card shows only the caller''s saved services');
select ok(not (pg_temp.card('f1', tests.film(3))->'card' ?| array['reason', 'reason_code', 'member_ratings']),
          'M6.41 rule 11: no reason label and no friend rating on the card');
select is(pg_temp.card('f2', tests.film(3))->>'status', 'not_found', 'M6.41: a film that is only in someone else''s rows answers not_found');
select is(pg_temp.card('f1', tests.film(14))->>'status', 'not_found', 'M6.41 rule 11: a film outside the caller''s rows answers not_found');

-- Rate limits (rule 14): 60 cards in 10 minutes; edits share 60.
select pg_temp.player('rl');
select pg_temp.fix('rl', tests.film(1), 'app', p_liked => interval '1 day');
create function pg_temp.hammer(p text, n integer, kind text) returns text language plpgsql as $$
declare i integer; v jsonb;
begin
  perform tests.authenticate_as(p);
  for i in 1..n loop
    if kind = 'card' then v := api.my_film_card(tests.film(1));
    elsif kind = 'seen' then v := api.set_film_seen(tests.film(1), true);
    else v := api.remove_my_film(tests.film(1)); end if;
  end loop;
  perform tests.clear_authentication();
  return v->>'status';
end $$;
select is(pg_temp.hammer('rl', 60, 'card'), 'ok', '60 card reads in 10 minutes are fine');
select is(pg_temp.hammer('rl', 1, 'card'), 'rate_limited', 'M6.41 rule 14: the 61st card read is rate_limited');
select pg_temp.player('rl2');
select pg_temp.fix('rl2', tests.film(1), 'app', p_liked => interval '1 day');
select is(pg_temp.hammer('rl2', 60, 'seen'), 'ok', '60 Mark as seen calls are fine');
select is(pg_temp.hammer('rl2', 1, 'remove'), 'rate_limited', 'M6.41 rule 14: set_film_seen and remove_my_film share one limit');

-- ---------------------------------------------------------------------------
-- Export, deletion, retention, grants
-- ---------------------------------------------------------------------------
select tests.authenticate_as('a1');
select set_config('tests.export_a1', (api.export_my_data())::text, true);
select tests.clear_authentication();
select ok((current_setting('tests.export_a1')::jsonb->'film_history'->0) ?& array['liked_at', 'super_liked', 'picked_at', 'seen_at'],
          'M6.41 rule 15: the export''s film history carries liked_at, super_liked, picked_at and seen_at');
select ok(exists (select 1 from jsonb_array_elements(current_setting('tests.export_a1')::jsonb->'film_history') h
                  where h->>'liked_at' is not null),
          'M6.41 rule 15: the export holds the real liked_at values');
select is(current_setting('tests.export_a1')::jsonb#>>'{games,0,mode}', 'quick_match', 'M6.41 rule 15: each game carries its mode');

-- Retention never deletes the rows.
update public.user_titles set updated_at = now() - interval '5 years', liked_at = now() - interval '5 years'
where profile_id = tests.uid('f1');
select count(*) as f1_rows from public.user_titles where profile_id = tests.uid('f1') \gset
select internal.run_retention();
select is((select count(*) from public.user_titles where profile_id = tests.uid('f1')), :f1_rows::bigint,
          'M6.41 rule 15: retention never touches user_titles');

-- Deleting the account deletes the rows.
select ok(:f1_rows > 0, 'f1 has rows before the account is deleted');
delete from auth.users where id = tests.uid('f1');
select is((select count(*) from public.user_titles where profile_id = tests.uid('f1')), 0::bigint,
          'M6.41 rule 15: deleting the account deletes the film history rows');

-- Grants.
select ok(has_function_privilege('authenticated', 'api.my_films(text, text, text, text)', 'execute')
          and has_function_privilege('authenticated', 'api.my_film_card(bigint, text)', 'execute')
          and has_function_privilege('authenticated', 'api.set_film_seen(bigint, boolean)', 'execute')
          and has_function_privilege('authenticated', 'api.remove_my_film(bigint)', 'execute'),
          'the four new functions are open to signed-in players');
select ok(not has_function_privilege('anon', 'api.my_films(text, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'api.my_film_card(bigint, text)', 'execute')
          and not has_function_privilege('anon', 'api.set_film_seen(bigint, boolean)', 'execute')
          and not has_function_privilege('anon', 'api.remove_my_film(bigint)', 'execute'),
          'M6.41: anon can execute none of the new functions');
select ok(not has_function_privilege('authenticated', 'internal.profile_card_payloads(uuid, bigint, text)', 'execute')
          and not has_function_privilege('anon', 'internal.profile_card_payloads(uuid, bigint, text)', 'execute'),
          'the room-less card builder is not open to phones');

select * from finish();
rollback;

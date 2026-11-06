-- Later as solo likes (decisions.md, 6 Nov 2026, replacing M6.50's Later segment; solo-and-my-films.md
-- sections 5, 6 and 10; privacy.md "Film history").
-- A player saves a film dealt to them with api.set_film_saved. A save is a solo like: liked_at on
-- their solo row, so My films lists it under Liked with the Solo chip. saved_at on the same row marks
-- the like as one a save made, so unsaving takes back only that, never a like from a game.
-- A save is never an answer: no room, deck, counter, match, near miss, shortlist or finalist reads it.
-- Solo decks skip a saved film, as they skip any like. There is no Later segment any more.
-- Rewritten from M6.50: the saved_at-on-the-app-row tests, the Later segment and the card's saved flag
-- are gone with the rules that made them; the room, export and limit tests stay.

begin;
select plan(68);

select tests.create_catalog(40);
update public.titles set is_active = false where original_title not like 'Catalog Film %';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function pg_temp.player(p text) returns void language plpgsql as $$
begin
  perform tests.create_player(p);
  insert into public.profile_providers (profile_id, provider_id) values (tests.uid(p), 9001);
end $$;

create function pg_temp.save(p text, t bigint, s boolean) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.set_film_saved(t, s);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.col(p text, t bigint, s text, c text) returns text language sql as $$
  select to_jsonb(ut)->>c from public.user_titles ut
  where ut.profile_id = tests.uid(p) and ut.title_id = t and ut.source = s::public.title_fact_source
$$;
create function pg_temp.has(p text, t bigint, s text default null) returns boolean language sql as $$
  select exists (select 1 from public.user_titles ut where ut.profile_id = tests.uid(p) and ut.title_id = t
                 and (s is null or ut.source = s::public.title_fact_source))
$$;
create function pg_temp.row_of(p text, t bigint, s text) returns jsonb language sql as $$
  select to_jsonb(ut) from public.user_titles ut
  where ut.profile_id = tests.uid(p) and ut.title_id = t and ut.source = s::public.title_fact_source
$$;
-- Moves a player's rows for a film back in time, so a vote in this test's one transaction never
-- shares a timestamp with a save made earlier in it.
create function pg_temp.age(p text, t bigint) returns void language sql as $$
  update public.user_titles
  set liked_at = liked_at - interval '1 day', saved_at = saved_at - interval '1 day'
  where profile_id = tests.uid(p) and title_id = t
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

create function pg_temp.card(p text, t bigint) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.my_film_card(t);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.act(p text, kind text, t bigint) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  if kind = 'remove' then v := api.remove_my_film(t);
  elsif kind = 'unseen' then v := api.set_film_seen(t, false);
  elsif kind = 'undo' then v := api.undo_last_vote(tests.room_id());
  end if;
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.vote_t(p text, t bigint, a public.vote_answer) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.cast_vote(tests.room_id(), t, a);
  perform tests.clear_authentication();
  return v;
end $$;

-- What a room shows, with nothing that differs between two rooms (ids, times): its state, every
-- card's counters, the matches, each seat's deck ahead and the count of each event on its topics.
create function pg_temp.snap(r uuid, prefix text, seats integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'state', (select ro.state from public.rooms ro where ro.id = r),
    'cards', (select jsonb_agg(jsonb_build_object('t', c.title_id, 'state', c.state, 'like', c.like_count,
                                                  'super', c.super_like_count, 'nope', c.nope_count,
                                                  'seen', c.seen_count) order by c.title_id)
              from public.room_cards c where c.room_id = r),
    'matches', (select coalesce(jsonb_agg(jsonb_build_object('t', m.title_id, 'kind', m.kind,
                                                             'likes', m.like_count, 'pick', m.pick_order)
                                          order by m.title_id), '[]')
                from public.matches m where m.room_id = r),
    'decks', (select jsonb_agg(to_jsonb(tests.upcoming(prefix || n, r)) order by n) from generate_series(1, seats) n),
    'events', (select coalesce(jsonb_object_agg(e.k, e.n), '{}') from (
                 select replace(m.topic, r::text, 'R') || '/' || m.event as k, count(*) as n
                 from realtime.messages m where m.topic like 'room:' || r::text || '%'
                 group by 1) e))
$$;

-- ---------------------------------------------------------------------------
-- Saving in a group room: a solo like
-- ---------------------------------------------------------------------------
select tests.deal_game(3, 'a');
select set_config('tests.room_a', tests.room_id()::text, true);
select pg_temp.player('stranger');

select count(*) as msgs_before from realtime.messages \gset
select count(*) as swipes_before from public.swipe_log \gset

-- 1. A save of a dealt card is a solo like.
select is(pg_temp.save('a1', tests.film(1), true)->>'status', 'ok', 'Later as a like: saving a card dealt in your room answers ok');
select ok(pg_temp.col('a1', tests.film(1), 'solo', 'liked_at') is not null,
          'Later as a like: a save sets liked_at on the player''s solo row');
select is(pg_temp.col('a1', tests.film(1), 'solo', 'saved_at'), pg_temp.col('a1', tests.film(1), 'solo', 'liked_at'),
          'Later as a like: the solo row''s saved_at is the like''s time, marking it as made by a save');
select ok(not pg_temp.has('a1', tests.film(1), 'app'),
          'Later as a like: a save writes nothing on the app row, so it never counts as a group like');
select ok(pg_temp.col('a1', tests.film(1), 'solo', 'super_liked') = 'false'
          and pg_temp.col('a1', tests.film(1), 'solo', 'picked_at') is null
          and pg_temp.col('a1', tests.film(1), 'solo', 'seen') = 'false'
          and pg_temp.col('a1', tests.film(1), 'solo', 'on_watchlist') = 'false',
          'Later as a like: a save is never a super like, a pick, a seen mark or a watchlist entry');

-- 2. A second save changes nothing.
select pg_temp.age('a1', tests.film(1));
select set_config('tests.a1_f1', coalesce(pg_temp.row_of('a1', tests.film(1), 'solo')::text, 'null'), true);
select is(pg_temp.save('a1', tests.film(1), true)->>'status', 'ok', 'Later as a like: saving a saved film again answers ok');
select is(pg_temp.row_of('a1', tests.film(1), 'solo'), current_setting('tests.a1_f1')::jsonb,
          'Later as a like: a second save changes nothing on the row');

-- Nothing is broadcast and nothing is logged.
select is((select count(*) from realtime.messages), :msgs_before::bigint, 'Later as a like: a save sends no Realtime message');
select is((select count(*) from public.swipe_log), :swipes_before::bigint, 'Later as a like: a save writes no swipe_log row');
select is((select count(*) from public.votes v join public.room_members m on m.id = v.room_member_id
           where m.profile_id = tests.uid('a1') and v.title_id = tests.film(1)), 0::bigint,
          'Later as a like: a save is not a vote');

-- 3. A film already liked in a game keeps that like as it is.
select tests.vote('a1', 2, 'like');
select set_config('tests.a1_f2', coalesce(pg_temp.row_of('a1', tests.film(2), 'app')::text, 'null'), true);
select is(pg_temp.save('a1', tests.film(2), true)->>'status', 'ok', 'Later as a like: saving a film liked in a group answers ok');
select ok(pg_temp.row_of('a1', tests.film(2), 'app') = current_setting('tests.a1_f2')::jsonb
          and not pg_temp.has('a1', tests.film(2), 'solo'),
          'Later as a like: saving a film liked in a group changes nothing and writes no solo row');
select is(pg_temp.save('a1', tests.film(2), false)->>'status', 'not_found',
          'Later as a like: unsaving a film liked in a group answers not_found');
select is(pg_temp.row_of('a1', tests.film(2), 'app'), current_setting('tests.a1_f2')::jsonb,
          'Later as a like: unsaving never takes back a like from a game');

-- A group's pick counts as liked too.
insert into public.user_titles (profile_id, title_id, source, picked_at)
values (tests.uid('a1'), tests.film(9), 'app', now() - interval '1 day');
select is(pg_temp.save('a1', tests.film(9), true)->>'status', 'ok', 'Later as a like: saving a group''s pick answers ok');
select ok(not pg_temp.has('a1', tests.film(9), 'solo'), 'Later as a like: saving a group''s pick writes nothing');

-- 4. Only a film dealt to the caller, or already in their rows.
select is(pg_temp.save('stranger', tests.film(1), true)->>'status', 'not_found',
          'Later as a like: saving a film never dealt to you answers not_found');
select ok(not pg_temp.has('stranger', tests.film(1)), 'Later as a like: a refused save writes no row');

-- 5. Unsaving.
select pg_temp.save('a1', tests.film(3), true);
select is(pg_temp.save('a1', tests.film(3), false)->>'status', 'ok', 'Later as a like: unsaving a saved film answers ok');
select ok(not pg_temp.has('a1', tests.film(3)), 'Later as a like: unsaving deletes a row that holds nothing else');
select is(pg_temp.save('a1', tests.film(3), false)->>'status', 'not_found',
          'Later as a like: unsaving a film that is not saved answers not_found');

-- 6. A saved like and a game: undo, a group like, a seen mark, Remove.
select pg_temp.save('a1', tests.film(4), true);
select pg_temp.age('a1', tests.film(4));
select tests.vote('a1', 4, 'like');
select ok(pg_temp.col('a1', tests.film(4), 'app', 'liked_at') is not null
          and pg_temp.col('a1', tests.film(4), 'solo', 'saved_at') is not null,
          'Later as a like: a group like of a saved film lands on the app row, the saved like stays');
select is(pg_temp.act('a1', 'undo', null)->>'status', 'ok', 'a1 undoes the group like of the saved film');
select ok(not pg_temp.has('a1', tests.film(4), 'app') and pg_temp.col('a1', tests.film(4), 'solo', 'liked_at') is not null,
          'Later as a like: undoing a group like keeps the saved like');
select tests.vote('a1', 4, 'like');
select is(pg_temp.save('a1', tests.film(4), false)->>'status', 'ok', 'a1 unsaves a film they also liked in a group');
select ok(not pg_temp.has('a1', tests.film(4), 'solo') and pg_temp.col('a1', tests.film(4), 'app', 'liked_at') is not null,
          'Later as a like: unsaving keeps the group like');

select tests.vote('a1', 5, 'seen');
select pg_temp.save('a1', tests.film(5), true);
select is(pg_temp.save('a1', tests.film(5), false)->>'status', 'ok', 'a1 unsaves a film they marked seen');
select is(pg_temp.col('a1', tests.film(5), 'app', 'seen'), 'true', 'Later as a like: unsaving keeps the seen mark');

select pg_temp.save('a1', tests.film(6), true);
select is(pg_temp.act('a1', 'remove', tests.film(6))->>'status', 'ok', 'Later as a like: Remove from Liked takes a saved like');
select ok(not pg_temp.has('a1', tests.film(6)), 'Later as a like: a removed saved like leaves no row, saved_at included');
select is(pg_temp.save('a1', tests.film(6), false)->>'status', 'not_found',
          'Later as a like: unsaving after Remove answers not_found');

-- ---------------------------------------------------------------------------
-- My films and the film sheet
-- ---------------------------------------------------------------------------
-- a1's films now: 1 saved (a day ago), 2 liked in the group, 4 liked in the group, 9 picked.
select ok(tests.film(1) = any (pg_temp.ids(pg_temp.films('a1', 'liked'))),
          'Later as a like: a saved film is in Liked');
select ok(tests.film(1) = any (pg_temp.ids(pg_temp.films('a1', 'liked', 'solo')))
          and not (tests.film(2) = any (pg_temp.ids(pg_temp.films('a1', 'liked', 'solo')))),
          'Later as a like: a saved film is under the Solo chip, a group like is not');
select ok(not (tests.film(1) = any (pg_temp.ids(pg_temp.films('a1', 'liked', 'friends')))),
          'Later as a like: a saved film is never under With friends');
select ok((select (f->>'at')::timestamptz < now() - interval '23 hours' and not (f->>'is_super_liked')::boolean
                  and not (f->>'is_picked')::boolean
           from jsonb_array_elements(pg_temp.films('a1', 'liked')->'films') f
           where (f->>'title_id')::bigint = tests.film(1)),
          'Later as a like: a saved film''s tile has the save''s time and no badge');
select throws_ok($$ select pg_temp.films('a1', 'later') $$, '22023', 'unknown segment',
                 'Later as a like: the later segment is gone and answers like any unknown segment');
select ok(not (tests.film(1) = any (pg_temp.ids(pg_temp.films('a1', 'seen')))),
          'Later as a like: a saved film is not in Seen');
select ok(not (tests.film(1) = any (pg_temp.ids(pg_temp.films('a2', 'liked')))),
          'Later as a like: another player''s saves never show in your Liked');
create function pg_temp.reads(p text, owner text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform tests.authenticate_as(p);
  begin
    execute format('select count(*) from public.user_titles where profile_id = %L', tests.uid(owner)) into n;
  exception when insufficient_privilege then
    n := 0;
  end;
  perform tests.clear_authentication();
  return n;
end $$;
select is(pg_temp.reads('a2', 'a1'), 0::bigint, 'Later as a like: nobody reads another player''s rows');

-- The film sheet.
select is(pg_temp.card('a1', tests.film(1))->>'liked', 'true', 'Later as a like: the film sheet says a saved film is liked');
select ok(not (pg_temp.card('a1', tests.film(1)) ? 'saved'),
          'Later as a like: the film sheet''s answer carries no saved flag');

-- ---------------------------------------------------------------------------
-- The export
-- ---------------------------------------------------------------------------
select tests.authenticate_as('a1');
select set_config('tests.export_a1', (api.export_my_data())::text, true);
select tests.clear_authentication();
select ok(exists (select 1 from jsonb_array_elements(current_setting('tests.export_a1')::jsonb->'film_history') h
                  where (h->>'tmdb_id')::bigint = (select t.tmdb_id from public.titles t where t.id = tests.film(1))
                    and h->>'source' = 'solo'
                    and (h->>'liked_at')::timestamptz = pg_temp.col('a1', tests.film(1), 'solo', 'liked_at')::timestamptz
                    and (h->>'saved_at')::timestamptz = pg_temp.col('a1', tests.film(1), 'solo', 'saved_at')::timestamptz),
          'Later as a like: the export carries a saved like with its source, liked_at and saved_at');
select ok((select bool_and(h ? 'saved_at') from jsonb_array_elements(current_setting('tests.export_a1')::jsonb->'film_history') h),
          'Later as a like: every film history row in the export has saved_at');

-- ---------------------------------------------------------------------------
-- Nothing in a room reads a save
-- ---------------------------------------------------------------------------
-- Two rooms dealt the same, playing the same votes; in one, the players saved films first.
select tests.deal_game(3, 'x');
select set_config('tests.room_x', tests.room_id()::text, true);
select tests.deal_game(3, 'y');
select set_config('tests.room_y', tests.room_id()::text, true);
select pg_temp.save('x1', tests.film(n), true) from generate_series(1, 4) n;
select pg_temp.save('x2', tests.film(2), true);
select pg_temp.save('x3', tests.film(3), true);
update public.user_titles set liked_at = liked_at - interval '1 day', saved_at = saved_at - interval '1 day'
where profile_id in (tests.uid('x1'), tests.uid('x2'), tests.uid('x3'));
select is((select count(*) from public.user_titles
           where source = 'solo' and liked_at is not null and saved_at is not null
             and profile_id in (tests.uid('x1'), tests.uid('x2'), tests.uid('x3'))),
          6::bigint, 'the six saved likes in the room with saves are in place');

create function pg_temp.play(prefix text, r uuid) returns void language plpgsql as $$
begin
  perform set_config('tests.room_id', r::text, true);
  -- Film 1: every like (a match). Film 2: one like short with a seat still to answer (a near miss).
  -- Film 3: nopes. Film 4: one like and a seen.
  perform tests.vote(prefix || '1', 1, 'like');
  perform tests.vote(prefix || '2', 1, 'like');
  perform tests.vote(prefix || '3', 1, 'super_like');
  perform tests.vote(prefix || '1', 2, 'like');
  perform tests.vote(prefix || '2', 2, 'like');
  perform tests.vote(prefix || '1', 3, 'nope');
  perform tests.vote(prefix || '2', 3, 'nope');
  perform tests.vote(prefix || '1', 4, 'like');
  perform tests.vote(prefix || '2', 4, 'seen');
end $$;

select is(pg_temp.snap(current_setting('tests.room_x')::uuid, 'x', 3)->'decks',
          pg_temp.snap(current_setting('tests.room_y')::uuid, 'y', 3)->'decks',
          'Later as a like: a save does not change anyone''s deck: the saved card stays to be swiped');
select pg_temp.play('x', current_setting('tests.room_x')::uuid);
select pg_temp.play('y', current_setting('tests.room_y')::uuid);
select ok(jsonb_array_length(pg_temp.snap(current_setting('tests.room_y')::uuid, 'y', 3)->'matches') > 0,
          'the room with no saves made a match');
select is(pg_temp.snap(current_setting('tests.room_x')::uuid, 'x', 3),
          pg_temp.snap(current_setting('tests.room_y')::uuid, 'y', 3),
          'Later as a like: saves change no counter, match, near miss, event or deck in a room');

-- Every function that reads saved_at is one of these, so no room function (the deck, cast_vote's
-- match check and near miss, the shortlist, the finalists, labels, card payloads) starts reading it.
-- internal.eligible_titles is the solo deck's skip (M6.53), which a saved like's liked_at already covers.
select is((select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prosrc ~ 'saved_at' and n.nspname in ('api', 'internal', 'public', 'rec')),
          array['api.export_my_data', 'api.remove_my_film', 'api.set_film_saved', 'internal.eligible_titles'],
          'Later as a like: only the save itself, Remove, the export and the solo deck read saved_at');
select ok(not exists (select 1 from information_schema.columns
                      where table_schema = 'api' and column_name = 'saved_at'),
          'Later as a like: no api view carries saved_at');
select set_config('tests.room_id', current_setting('tests.room_x'), true);
select tests.authenticate_as('x1');
select set_config('tests.x_cards', (api.my_next_cards(tests.room_id()))::text
                  || (api.title_cards(tests.room_id(), array[tests.film(1), tests.film(5)]))::text, true);
select tests.clear_authentication();
select ok(current_setting('tests.x_cards') !~ 'saved', 'Later as a like: room cards carry nothing of a save');

-- A group deck still deals a film a seat saved, with no watchlist weight.
select tests.deal_game(2, 'g', 'dealing');
insert into public.user_titles (profile_id, title_id, source, liked_at, saved_at)
values (tests.uid('g1'), tests.film(7), 'solo', now(), now());
select ok(exists (select 1 from internal.deck_candidates(tests.room_id()) d
                  where d.title_id = tests.film(7) and d.watchlist_count = 0),
          'Later as a like: a group deck deals a saved film like any other, with no watchlist weight');

-- ---------------------------------------------------------------------------
-- Solo rooms
-- ---------------------------------------------------------------------------
select tests.use_deck_engine('sql');
select pg_temp.player('s1');
select tests.authenticate_as('s1');
select set_config('tests.room_id', (api.start_solo())->>'room_id', true);
select tests.clear_authentication();
select set_config('tests.s1_films', (tests.upcoming('s1'))::text, true);
create function pg_temp.sf(n integer) returns bigint language sql as $$
  select (current_setting('tests.s1_films')::bigint[])[n]
$$;

-- A save in a solo room, then the same card liked: a like from the game too.
select is(pg_temp.save('s1', pg_temp.sf(1), true)->>'status', 'ok', 'Later as a like: a solo player saves a card');
select pg_temp.age('s1', pg_temp.sf(1));
select is(pg_temp.vote_t('s1', pg_temp.sf(1), 'like')->>'status', 'ok', 's1 then likes the saved card');
select is((select (r->>'status') from (select tests.authenticate_as('s1')) x,
                  api.solo_pick(tests.room_id(), pg_temp.sf(1)) r),
          'ok', 'Later as a like: a saved film the player also liked in the session can be the solo pick');
select tests.clear_authentication();
select is(pg_temp.save('s1', pg_temp.sf(1), false)->>'status', 'ok', 's1 unsaves the card they also liked');
select ok(pg_temp.col('s1', pg_temp.sf(1), 'solo', 'liked_at') is not null
          and pg_temp.col('s1', pg_temp.sf(1), 'solo', 'saved_at') is null,
          'Later as a like: unsaving keeps a like given in a solo game, and only clears the save''s mark');
select is(pg_temp.save('s1', pg_temp.sf(1), false)->>'status', 'not_found',
          'Later as a like: unsaving it again answers not_found');

-- A save, then an undone like in the same session: the save stays.
select pg_temp.player('s2');
select tests.authenticate_as('s2');
select set_config('tests.room_id', (api.start_solo())->>'room_id', true);
select tests.clear_authentication();
select set_config('tests.s2_films', (tests.upcoming('s2'))::text, true);
select pg_temp.save('s2', (current_setting('tests.s2_films')::bigint[])[1], true);
select pg_temp.age('s2', (current_setting('tests.s2_films')::bigint[])[1]);
select pg_temp.vote_t('s2', (current_setting('tests.s2_films')::bigint[])[1], 'super_like');
select pg_temp.act('s2', 'undo', null);
select ok(pg_temp.col('s2', (current_setting('tests.s2_films')::bigint[])[1], 'solo', 'liked_at') is not null
          and pg_temp.col('s2', (current_setting('tests.s2_films')::bigint[])[1], 'solo', 'super_liked') = 'false',
          'Later as a like: undoing a solo like of a saved film keeps the saved like and takes the star');
select is(pg_temp.save('s2', (current_setting('tests.s2_films')::bigint[])[1], false)->>'status', 'ok',
          's2 unsaves after the undo');
select ok(not pg_temp.has('s2', (current_setting('tests.s2_films')::bigint[])[1]),
          'Later as a like: with the game''s like undone, unsaving takes the like and the row');

-- A new solo deck skips a saved film, as it skips any like.
select pg_temp.save('s2', (current_setting('tests.s2_films')::bigint[])[2], true);
select tests.authenticate_as('s2');
select api.leave_room(tests.room_id());
select set_config('tests.room_id', (api.start_solo())->>'room_id', true);
select tests.clear_authentication();
select ok(not exists (select 1 from public.room_cards c where c.room_id = tests.room_id()
                      and c.title_id = (current_setting('tests.s2_films')::bigint[])[2])
          and exists (select 1 from public.room_cards c where c.room_id = tests.room_id()
                      and c.title_id = (current_setting('tests.s2_films')::bigint[])[3]),
          'Later as a like: a new solo deck skips a saved film, and still deals a film only skipped by swiping nothing');

-- ---------------------------------------------------------------------------
-- Limits, errors, retention, deletion, grants
-- ---------------------------------------------------------------------------
select pg_temp.player('rl');
insert into public.user_titles (profile_id, title_id, source, liked_at) values (tests.uid('rl'), tests.film(1), 'app', now());
create function pg_temp.hammer(p text, n integer) returns text language plpgsql as $$
declare i integer; v jsonb;
begin
  perform tests.authenticate_as(p);
  for i in 1..n loop v := api.set_film_seen(tests.film(1), true); end loop;
  v := api.set_film_saved(tests.film(1), true);
  perform tests.clear_authentication();
  return v->>'status';
end $$;
select is(pg_temp.hammer('rl', 60), 'rate_limited', 'Later as a like: saves share the 60 edits in 10 minutes of My films');
select throws_ok($$ select pg_temp.save('a1', tests.film(1), null) $$, '22023', 'saved needs a value',
                 'Later as a like: a null saved raises');
select throws_ok($$ select api.set_film_saved(1, true) $$, '42501', 'no profile for this user',
                 'Later as a like: no profile raises');

update public.user_titles set liked_at = now() - interval '5 years', saved_at = now() - interval '5 years',
  updated_at = now() - interval '5 years'
where profile_id = tests.uid('a1') and source = 'solo';
select internal.run_retention();
select ok(pg_temp.col('a1', tests.film(1), 'solo', 'saved_at') is not null, 'Later as a like: retention never touches a saved like');
delete from auth.users where id = tests.uid('a1');
select is((select count(*) from public.user_titles where profile_id = tests.uid('a1')), 0::bigint,
          'Later as a like: deleting the account deletes saved likes');

select ok(has_function_privilege('authenticated', 'api.set_film_saved(bigint, boolean)', 'execute'),
          'Later as a like: players can call api.set_film_saved');
select ok(not has_function_privilege('anon', 'api.set_film_saved(bigint, boolean)', 'execute'),
          'Later as a like: anon cannot call api.set_film_saved');

select * from finish();
rollback;

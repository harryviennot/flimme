-- M6.50: Later on the server (decisions.md "Later, the name and the bookmark", 6 Nov 2026;
-- solo-and-my-films.md sections 5, 6 and 10; privacy.md "Film history").
-- A player saves a film dealt to them with api.set_film_saved; it lands in user_titles.saved_at on
-- their app row, is listed by api.my_films('later'), read by api.my_film_card and exported.
-- A save is never an answer: no room, deck, counter, match, near miss, shortlist or finalist reads it.
-- Solo decks skip saved films, as they skip the rest of My films.

begin;
select plan(53);

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
create function pg_temp.has(p text, t bigint) returns boolean language sql as $$
  select exists (select 1 from public.user_titles ut where ut.profile_id = tests.uid(p) and ut.title_id = t)
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
-- A group room: saving and unsaving
-- ---------------------------------------------------------------------------
select tests.deal_game(3, 'a');
select set_config('tests.room_a', tests.room_id()::text, true);
select pg_temp.player('stranger');

select count(*) as msgs_before from realtime.messages \gset
select count(*) as swipes_before from public.swipe_log \gset

-- 1. A save of a dealt card.
select is(pg_temp.save('a1', tests.film(1), true)->>'status', 'ok', 'M6.50: saving a card dealt in your room answers ok');
select ok(pg_temp.col('a1', tests.film(1), 'app', 'saved_at') is not null,
          'M6.50: a save sets saved_at on the player''s app row');
select ok(pg_temp.col('a1', tests.film(1), 'app', 'liked_at') is null
          and pg_temp.col('a1', tests.film(1), 'app', 'super_liked') = 'false'
          and pg_temp.col('a1', tests.film(1), 'app', 'picked_at') is null
          and pg_temp.col('a1', tests.film(1), 'app', 'seen') = 'false'
          and pg_temp.col('a1', tests.film(1), 'app', 'on_watchlist') = 'false',
          'M6.50: a save is never a like, a pick, a seen mark or a watchlist entry');

-- 2. A second save keeps the first time.
update public.user_titles set saved_at = now() - interval '1 day'
where profile_id = tests.uid('a1') and title_id = tests.film(1);
select is(pg_temp.save('a1', tests.film(1), true)->>'status', 'ok', 'M6.50: saving a saved film again answers ok');
select ok(pg_temp.col('a1', tests.film(1), 'app', 'saved_at')::timestamptz < now() - interval '23 hours',
          'M6.50: a second save keeps the first saved_at');

-- 3. Only a film dealt to the caller, or already in their rows.
select is(pg_temp.save('stranger', tests.film(1), true)->>'status', 'not_found',
          'M6.50: saving a film never dealt to you answers not_found');
select ok(not pg_temp.has('stranger', tests.film(1)), 'M6.50: a refused save writes no row');

-- Nothing is broadcast and nothing is logged.
select is((select count(*) from realtime.messages), :msgs_before::bigint, 'M6.50: a save sends no Realtime message');
select is((select count(*) from public.swipe_log), :swipes_before::bigint, 'M6.50: a save writes no swipe_log row');
select is((select count(*) from public.votes v join public.room_members m on m.id = v.room_member_id
           where m.profile_id = tests.uid('a1')), 0::bigint, 'M6.50: a save is not a vote');

-- 4. Unsaving.
select pg_temp.save('a1', tests.film(2), true);
select is(pg_temp.save('a1', tests.film(2), false)->>'status', 'ok', 'M6.50: unsaving a saved film answers ok');
select ok(not pg_temp.has('a1', tests.film(2)), 'M6.50: unsaving deletes a row that holds nothing else');
select is(pg_temp.save('a1', tests.film(2), false)->>'status', 'not_found', 'M6.50: unsaving a film that is not saved answers not_found');

-- 5. Undo, Not seen and Remove keep a saved film.
select pg_temp.save('a1', tests.film(3), true);
select tests.vote('a1', 3, 'like');
select is(pg_temp.act('a1', 'undo', null)->>'status', 'ok', 'a1 undoes the like on a saved film');
select ok(pg_temp.col('a1', tests.film(3), 'app', 'saved_at') is not null
          and pg_temp.col('a1', tests.film(3), 'app', 'liked_at') is null,
          'M6.50: undoing a like keeps the save');
select tests.vote('a1', 3, 'like');
select is(pg_temp.act('a1', 'remove', tests.film(3))->>'status', 'ok', 'a1 removes the saved film from Liked');
select ok(pg_temp.col('a1', tests.film(3), 'app', 'saved_at') is not null, 'M6.50: Remove from Liked keeps the save');
select tests.vote('a1', 4, 'seen');
select pg_temp.save('a1', tests.film(4), true);
select is(pg_temp.act('a1', 'unseen', tests.film(4))->>'status', 'ok', 'a1 marks the saved film Not seen');
select ok(pg_temp.col('a1', tests.film(4), 'app', 'saved_at') is not null, 'M6.50: Not seen keeps the save');

-- 6. Unsaving keeps a like and a seen mark.
select tests.vote('a1', 5, 'like');
select tests.vote('a1', 6, 'seen');
select pg_temp.save('a1', tests.film(5), true);
select pg_temp.save('a1', tests.film(6), true);
select pg_temp.save('a1', tests.film(5), false);
select pg_temp.save('a1', tests.film(6), false);
select ok(pg_temp.col('a1', tests.film(5), 'app', 'liked_at') is not null
          and pg_temp.col('a1', tests.film(6), 'app', 'seen') = 'true'
          and pg_temp.col('a1', tests.film(5), 'app', 'saved_at') is null,
          'M6.50: unsaving keeps the like and the seen mark');

-- ---------------------------------------------------------------------------
-- The later segment and the film sheet
-- ---------------------------------------------------------------------------
-- a1's saved films now: 1 (a day ago), 3, 4. Film 5 is liked but no longer saved.
update public.user_titles set saved_at = now() - interval '2 hours'
where profile_id = tests.uid('a1') and title_id = tests.film(3);
update public.user_titles set saved_at = now() - interval '1 hour'
where profile_id = tests.uid('a1') and title_id = tests.film(4);

select is(pg_temp.ids(pg_temp.films('a1', 'later')), array[tests.film(4), tests.film(3), tests.film(1)],
          'M6.50: Later lists only saved films, newest save first');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.films('a1', 'later')->'films') f
                      where (f->>'is_picked')::boolean or (f->>'is_super_liked')::boolean),
          'M6.50: Later tiles carry no badge');
select ok((select (f->>'at')::timestamptz between now() - interval '61 minutes' and now() - interval '59 minutes'
           from jsonb_array_elements(pg_temp.films('a1', 'later')->'films') f limit 1),
          'M6.50: a Later tile''s time is when it was saved');
select is(pg_temp.films('a1', 'later', 'friends'), pg_temp.films('a1', 'later', 'solo'),
          'M6.50: the filter does not change Later');
select ok(not (tests.film(1) = any (pg_temp.ids(pg_temp.films('a1', 'liked')))),
          'M6.50: a saved film that is not liked is not in Liked');
select throws_ok($$ select pg_temp.films('a1', 'watchlist') $$, '22023', 'unknown segment',
                 'M6.50: an unknown segment still raises');
select is(pg_temp.ids(pg_temp.films('a2', 'later')), '{}'::bigint[], 'M6.50: another player''s saves never show in your Later');
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
select is(pg_temp.reads('a2', 'a1'), 0::bigint, 'M6.50: nobody reads another player''s saved rows');

-- Paging: 61 saved films give a page of 60 and a cursor.
select pg_temp.player('pager');
insert into public.user_titles (profile_id, title_id, source, saved_at)
select tests.uid('pager'), t.id, 'app', now() - (row_number() over (order by t.id)) * interval '1 minute'
from (select id from public.titles order by id limit 61) t;
update public.titles set is_active = true;
select is(jsonb_array_length(pg_temp.films('pager', 'later')->'films'), 60, 'M6.50: Later pages by 60');
select is(jsonb_array_length(pg_temp.films('pager', 'later', 'all', pg_temp.films('pager', 'later')->>'next_cursor')->'films'), 1,
          'M6.50: the cursor gives the next page of Later');
update public.titles set is_active = false where original_title not like 'Catalog Film %';

-- The film sheet.
select ok((pg_temp.card('a1', tests.film(1))->>'saved')::boolean, 'M6.50: the film sheet says a saved film is saved');
select is(pg_temp.card('a1', tests.film(5))->>'saved', 'false', 'M6.50: the film sheet says an unsaved film is not saved');

-- ---------------------------------------------------------------------------
-- The export
-- ---------------------------------------------------------------------------
select tests.authenticate_as('a1');
select set_config('tests.export_a1', (api.export_my_data())::text, true);
select tests.clear_authentication();
select ok(exists (select 1 from jsonb_array_elements(current_setting('tests.export_a1')::jsonb->'film_history') h
                  where (h->>'tmdb_id')::bigint = (select t.tmdb_id from public.titles t where t.id = tests.film(1))
                    and (h->>'saved_at')::timestamptz = pg_temp.col('a1', tests.film(1), 'app', 'saved_at')::timestamptz),
          'M6.50: the export carries the real saved_at');
select ok((select bool_and(h ? 'saved_at') from jsonb_array_elements(current_setting('tests.export_a1')::jsonb->'film_history') h),
          'M6.50: every film history row in the export has saved_at');

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
select is((select count(*) from public.user_titles
           where saved_at is not null and profile_id in (tests.uid('x1'), tests.uid('x2'), tests.uid('x3'))),
          6::bigint, 'the six saves in the room with saves are in place');

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
          'M6.50: a save does not change anyone''s deck: the saved card stays to be swiped');
select pg_temp.play('x', current_setting('tests.room_x')::uuid);
select pg_temp.play('y', current_setting('tests.room_y')::uuid);
select ok(jsonb_array_length(pg_temp.snap(current_setting('tests.room_y')::uuid, 'y', 3)->'matches') > 0,
          'the room with no saves made a match');
select is(pg_temp.snap(current_setting('tests.room_x')::uuid, 'x', 3),
          pg_temp.snap(current_setting('tests.room_y')::uuid, 'y', 3),
          'M6.50: saves change no counter, match, near miss, event or deck in a room');

-- The solo deck's filter lives in internal.eligible_titles since M6.53 (it was in internal.deck_candidates).
-- Every function that reads saved_at is one of these, so no room function (the deck, cast_vote''s
-- match check and near miss, the shortlist, the finalists, labels, card payloads) starts reading it.
select is((select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where p.prosrc ~ 'saved_at' and n.nspname in ('api', 'internal', 'public', 'rec')),
          array['api.export_my_data', 'api.my_film_card', 'api.my_films', 'api.set_film_saved',
                'internal.eligible_titles', 'internal.prune_film_rows'],
          'M6.50: only My films, the export, the pruner and the solo deck read saved_at');
select ok(not exists (select 1 from information_schema.columns
                      where table_schema = 'api' and column_name = 'saved_at'),
          'M6.50: no api view carries saved_at');
select set_config('tests.room_id', current_setting('tests.room_x'), true);
select tests.authenticate_as('x1');
select set_config('tests.x_cards', (api.my_next_cards(tests.room_id()))::text
                  || (api.title_cards(tests.room_id(), array[tests.film(1), tests.film(5)]))::text, true);
select tests.clear_authentication();
select ok(current_setting('tests.x_cards') !~ 'saved', 'M6.50: room cards carry nothing of a save');

-- A group deck still deals a film a seat saved, with no watchlist weight.
select tests.deal_game(2, 'g', 'dealing');
insert into public.user_titles (profile_id, title_id, source, saved_at)
values (tests.uid('g1'), tests.film(7), 'app', now());
select ok(exists (select 1 from internal.deck_candidates(tests.room_id()) d
                  where d.title_id = tests.film(7) and d.watchlist_count = 0),
          'M6.50: a group deck deals a saved film like any other, with no watchlist weight');

-- ---------------------------------------------------------------------------
-- Solo decks skip saved films
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
select is(pg_temp.save('s1', pg_temp.sf(1), true)->>'status', 'ok', 'M6.50: a solo player saves a card');
select ok(pg_temp.col('s1', pg_temp.sf(1), 'app', 'saved_at') is not null,
          'M6.50: a save in a solo room also lands on the app row');
select is((select (r->>'status') from (select tests.authenticate_as('s1')) x,
                  api.solo_pick(tests.room_id(), pg_temp.sf(1)) r),
          'not_liked', 'M6.50: a saved film is not a like for the solo pick');
select tests.clear_authentication();
select tests.authenticate_as('s1');
select api.leave_room(tests.room_id());
select set_config('tests.room_id', (api.start_solo())->>'room_id', true);
select tests.clear_authentication();
select ok(not exists (select 1 from public.room_cards c where c.room_id = tests.room_id() and c.title_id = pg_temp.sf(1))
          and exists (select 1 from public.room_cards c where c.room_id = tests.room_id() and c.title_id = pg_temp.sf(2)),
          'M6.50: a new solo deck skips a saved film, and still deals a film only skipped by swiping nothing');

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
select is(pg_temp.hammer('rl', 60), 'rate_limited', 'M6.50: saves share the 60 edits in 10 minutes of My films');
select throws_ok($$ select pg_temp.save('a1', tests.film(1), null) $$, '22023', 'saved needs a value',
                 'M6.50: a null saved raises');
select throws_ok($$ select api.set_film_saved(1, true) $$, '42501', 'no profile for this user',
                 'M6.50: no profile raises');

update public.user_titles set saved_at = now() - interval '5 years', updated_at = now() - interval '5 years'
where profile_id = tests.uid('a1');
select internal.run_retention();
select ok(pg_temp.col('a1', tests.film(1), 'app', 'saved_at') is not null, 'M6.50: retention never touches a saved film');
delete from auth.users where id = tests.uid('a1');
select is((select count(*) from public.user_titles where profile_id = tests.uid('a1')), 0::bigint,
          'M6.50: deleting the account deletes saved films');

select ok(has_function_privilege('authenticated', 'api.set_film_saved(bigint, boolean)', 'execute'),
          'M6.50: players can call api.set_film_saved');
select ok(not has_function_privilege('anon', 'api.set_film_saved(bigint, boolean)', 'execute'),
          'M6.50: anon cannot call api.set_film_saved');

select * from finish();
rollback;

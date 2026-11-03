-- M5.4: a "Seen it" swipe is saved to user_titles (source app), so later games leave the film out
-- (data-model.md#a-swipe, deck-engine.md#signals, game-modes.md#the-answers).

begin;
select plan(22);

select tests.create_catalog(30);
select tests.deal_game(3, 'p', 'swiping');
select tests.use_deck_engine('sql');
select set_config('tests.room_a', tests.room_id()::text, true);

create function pg_temp.mark(p_name text, p_film integer) returns text
language sql as $$
  select ut.source::text || '/' || ut.seen
  from public.user_titles ut
  where ut.profile_id = tests.uid(p_name) and ut.title_id = tests.film(p_film) and ut.source = 'app'
$$;

-- T1: the swipe saves the mark.
select is(tests.vote('p1', 1, 'seen')->>'status', 'ok', 'T1 p1''s "seen it" answers ok');
select is(pg_temp.mark('p1', 1), 'app/true', 'T1 user_titles has (p1, film 1, app) with seen true');

-- T2: every seen rule saves it.
update public.rooms set seen_rule = 'allow_rewatch' where id = tests.room_id();
select is(tests.vote('p1', 2, 'seen')->>'status', 'ok', 'T2 "seen it" answers ok under allow_rewatch');
select is(pg_temp.mark('p1', 2), 'app/true', 'T2 the mark is saved under allow_rewatch');
update public.rooms set seen_rule = 'show_all' where id = tests.room_id();
select is(tests.vote('p1', 3, 'seen')->>'status', 'ok', 'T2 "seen it" answers ok under show_all');
select is(pg_temp.mark('p1', 3), 'app/true', 'T2 the mark is saved under show_all');
select is((select count(*) from public.user_titles where profile_id = tests.uid('p1') and title_id = tests.film(1) and source = 'app'),
  1::bigint, 'T2 the mark under hide_seen (film 1) is there too, once');

-- T3: p1's next room leaves the film out, in the candidates and in the dealt cards.
update public.rooms set state = 'done' where id = tests.room_id();
select tests.authenticate_as('p1');
select set_config('tests.room_b', (api.create_room('quick_match', 'FR')->>'room_id'), true);
select api.set_seat_prefs(current_setting('tests.room_b')::uuid, '{9001}');
select set_config('tests.code_b', (select code from public.rooms where id = current_setting('tests.room_b')::uuid), true);
select tests.authenticate_as('p2');
select api.join_room(current_setting('tests.code_b'));
select api.set_seat_prefs(current_setting('tests.room_b')::uuid, '{9001}');
select tests.clear_authentication();
select is((select count(*) from internal.deck_candidates(current_setting('tests.room_b')::uuid, 300, 0) c
           where c.title_id in (tests.film(1), tests.film(2), tests.film(3))),
  0::bigint, 'T3 the films p1 saw are not among the new room''s candidates (hide_seen)');
select is((select count(*) from internal.deck_candidates(current_setting('tests.room_b')::uuid, 300, 0) c where c.title_id = tests.film(4)),
  1::bigint, 'T3 control: a film nobody saw is a candidate');

select tests.authenticate_as('p1');
select is(api.start_game(current_setting('tests.room_b')::uuid)->>'status', 'ok', 'T3 control: the new room starts');
select tests.clear_authentication();
select cmp_ok((select count(*) from public.deck_entries d join public.room_members m on m.id = d.room_member_id
               where d.room_id = current_setting('tests.room_b')::uuid and m.profile_id = tests.uid('p1')),
  '>', 0::bigint, 'T3 control: p1 has cards in the new room');
select is((select count(*) from public.deck_entries d
           where d.room_id = current_setting('tests.room_b')::uuid and d.title_id in (tests.film(1), tests.film(2), tests.film(3))),
  0::bigint, 'T3 the films p1 saw are in nobody''s dealt cards in the new room');

-- T4: the mark is p1's, not the film's.
update public.rooms set state = 'done' where id = current_setting('tests.room_b')::uuid;
select tests.authenticate_as('p2');
select set_config('tests.room_c', (api.create_room('quick_match', 'FR')->>'room_id'), true);
select set_config('tests.code_c', (select code from public.rooms where id = current_setting('tests.room_c')::uuid), true);
select tests.authenticate_as('p3');
select api.join_room(current_setting('tests.code_c'));
select api.set_seat_prefs(current_setting('tests.room_c')::uuid, '{9001}');
select tests.authenticate_as('p2');
select api.set_seat_prefs(current_setting('tests.room_c')::uuid, '{9001}');
select tests.clear_authentication();
select is((select count(*) from internal.deck_candidates(current_setting('tests.room_c')::uuid, 300, 0) c where c.title_id = tests.film(1)),
  1::bigint, 'T4 without p1 in the room, the film can be dealt');

-- Back to room A for the swipe rules.
select set_config('tests.room_id', current_setting('tests.room_a'), true);
update public.rooms set state = 'swiping', seen_rule = 'show_all' where id = tests.room_id();

-- T5: an existing app row keeps its reaction and rating.
insert into public.user_titles (profile_id, title_id, source, seen, reaction, rating, last_watched_on)
values (tests.uid('p2'), tests.film(6), 'app', false, 'love', 4, date '2026-01-02');
select is(tests.vote('p2', 6, 'seen')->>'status', 'ok', 'T5 p2''s "seen it" answers ok');
select is(
  (select ut.seen::text || '/' || ut.reaction || '/' || ut.rating || '/' || ut.last_watched_on
   from public.user_titles ut where ut.profile_id = tests.uid('p2') and ut.title_id = tests.film(6) and ut.source = 'app'),
  'true/love/4.0/2026-01-02', 'T5 seen is set, the reaction, rating and last watched date stay');

-- T6: a retried vote answers duplicate and leaves one row.
select tests.vote('p1', 7, 'seen');
select is(tests.vote('p1', 7, 'seen')->>'status', 'duplicate', 'T6 the retry answers duplicate');
select is((select count(*) from public.user_titles where profile_id = tests.uid('p1') and title_id = tests.film(7)),
  1::bigint, 'T6 there is still one row');

-- T7: other answers write nothing.
select tests.vote('p3', 8, 'like');
select tests.vote('p3', 9, 'nope');
select tests.vote('p3', 10, 'super_like');
select is((select count(*) from public.user_titles where profile_id = tests.uid('p3')), 0::bigint,
  'T7 a like, a nope and a super like write no user_titles row');

-- T8: a seat with no profile saves nothing.
select set_config('tests.seat_p3', tests.member_id('p3', tests.room_id())::text, true);
update public.room_members set profile_id = null where id = current_setting('tests.seat_p3')::uuid;
select tests.authenticate_as('p3');
select is(api.cast_vote(tests.room_id(), tests.film(11), 'seen', current_setting('tests.seat_p3')::uuid)->>'status', 'ok',
  'T8 the vote of a seat with no profile answers ok');
select tests.clear_authentication();
select is((select count(*) from public.user_titles where title_id = tests.film(11)), 0::bigint,
  'T8 nothing is saved for it');

-- T9: privacy.
select tests.authenticate_as('p2');
select throws_ok($$select count(*) from public.user_titles$$, '42501', null,
  'T9 p2 can''t read user_titles (no one reads another player''s marks)');
select tests.authenticate_as('p1');
create temp table t9_export as select api.export_my_data() as e;
select tests.clear_authentication();
select is(
  (select count(*) from t9_export, jsonb_array_elements(e->'film_history') h
   where h->>'source' = 'app' and (h->>'seen')::boolean and (h->>'tmdb_id')::bigint = (select t.tmdb_id from public.titles t where t.id = tests.film(1))),
  1::bigint, 'T9 api.export_my_data as p1 lists film 1 as seen');

select * from finish();
rollback;

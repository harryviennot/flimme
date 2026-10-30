-- The taste check, the after-game answer and the data export (deck-engine.md#the-taste-check,
-- data-model.md#after-the-match and #deleting-an-account-exporting-data). P1b, P3b and P3c
-- are beyond the 120 checks of data-model.md#what-was-tested.
--
-- Not pinned: whether calibration marks films as seen (M19.4), when the follow-up is asked
-- or a second answer (M15.5), and the export's shape beyond profile, games and film_history (M8.6).

begin;
select plan(28);

select tests.create_catalog(40);
insert into public.calibration_titles (title_id, axis, sort, is_active) values
  (tests.film(1), 'horror', 1, true),
  (tests.film(2), 'romcom', 2, true),
  (tests.film(5), 'arthouse', 3, true),
  (tests.film(3), 'animated', 4, false);

-- P1, P2: calibration saves only calibration films.
select tests.create_player('c1');
select tests.authenticate_as('c1');
create temp table p1_answer as select api.submit_calibration(jsonb_build_array(
  jsonb_build_object('title_id', tests.film(1), 'answer', 'love'),
  jsonb_build_object('title_id', tests.film(2), 'answer', 'not_seen'),
  jsonb_build_object('title_id', tests.film(3), 'answer', 'fine'),
  jsonb_build_object('title_id', tests.film(4), 'answer', 'love'),
  jsonb_build_object('title_id', tests.film(5), 'answer', 'meh'))) as a;
select tests.clear_authentication();
select is((select a->>'status' || '/' || (a->>'saved') from p1_answer), 'ok/2', 'P1 submit_calibration answers ok and saved 2');
select is(
  (select count(*) from public.user_titles ut where ut.profile_id = tests.uid('c1') and ut.source = 'calibration'),
  2::bigint,
  'P1 c1 has exactly two calibration rows'
);
select is(
  (select ut.reaction::text from public.user_titles ut
   where ut.profile_id = tests.uid('c1') and ut.source = 'calibration' and ut.title_id = tests.film(1)),
  'love',
  'P1 film 1 is stored with reaction love'
);
select is(
  (select count(*) from public.user_titles ut
   where ut.profile_id = tests.uid('c1') and ut.source = 'calibration'
     and ut.title_id = tests.film(2) and ut.reaction is null),
  1::bigint,
  'P1 "not seen" film 2 is stored with no reaction'
);
select is(
  (select count(*) from public.user_titles ut
   where ut.profile_id = tests.uid('c1') and ut.title_id in (tests.film(3), tests.film(4), tests.film(5))),
  0::bigint,
  'P1 an inactive film, a film outside the pool and an invalid answer are not saved'
);
select is(
  (select count(*) from tests.queued('taste_refresh') q
   where (q->>'profile_id')::uuid = tests.uid('c1') and q->>'reason' = 'calibration'),
  1::bigint,
  'P2 exactly one taste_refresh with reason calibration is queued for c1'
);

-- P1b: calibrating from a room marks the seat.
select tests.create_room(2, 'quick_match', 'FR', 'k');
select is(
  (select m.calibrated_at is null from public.room_members m where m.id = tests.member_id('k2')),
  true,
  'P1b positive control: k2 is not calibrated before answering (beyond the 120)'
);
select tests.authenticate_as('k2');
create temp table p1b_answer as select api.submit_calibration(
  jsonb_build_array(jsonb_build_object('title_id', tests.film(1), 'answer', 'fine')), tests.room_id()) as a;
select tests.clear_authentication();
select is((select a->>'status' from p1b_answer), 'ok', 'P1b submit_calibration with a room answers ok (beyond the 120)');
select is(
  (select m.calibrated_at is not null from public.room_members m where m.id = tests.member_id('k2')),
  true,
  'P1b k2''s seat has calibrated_at set (beyond the 120)'
);
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'seat_updated') s
   where (s->>'member_id')::uuid = tests.member_id('k2')),
  1::bigint,
  'P1b one seat_updated broadcast names k2''s seat (beyond the 120)'
);

-- P3, P3b: the after-game answer turns the winner into a seen film.
select tests.deal_game(2, 'w');
select set_config('tests.room_a', tests.room_id()::text, true);
select tests.vote('w1', 1);
select tests.vote('w2', 1);
select is(
  (select r.state::text from public.rooms r where r.id = current_setting('tests.room_a')::uuid),
  'done',
  'P3 precondition: room A is done after both like film 1'
);
select is(
  (select count(*) from public.user_titles ut where ut.profile_id = tests.uid('w1') and ut.title_id = tests.film(1)),
  0::bigint,
  'P3 positive control: w1 has no film history for film 1 before answering'
);
select tests.authenticate_as('w1');
create temp table p3_answer as select api.answer_followup(current_setting('tests.room_a')::uuid, 'yes', 'love') as a;
select tests.clear_authentication();
select is((select a->>'status' from p3_answer), 'ok', 'P3 answer_followup yes answers ok');
select is(
  (select ut.source::text || '/' || ut.seen || '/' || ut.reaction::text || '/' || (ut.last_watched_on = current_date)
   from public.user_titles ut where ut.profile_id = tests.uid('w1') and ut.title_id = tests.film(1)),
  'app/true/love/true',
  'P3 w1 has a seen row for film 1: source app, reaction love, watched today'
);
select is(
  (select m.watched_answer::text || '/' || m.post_reaction::text || '/' || (m.followup_at is not null)
   from public.room_members m where m.id = tests.member_id('w1', current_setting('tests.room_a')::uuid)),
  'yes/love/true',
  'P3 w1''s seat records the answer, the reaction and followup_at'
);
select is(
  (select count(*) from tests.queued('taste_refresh') q
   where (q->>'profile_id')::uuid = tests.uid('w1') and q->>'reason' = 'followup'),
  1::bigint,
  'P3 exactly one taste_refresh with reason followup is queued for w1'
);

select tests.authenticate_as('w2');
create temp table p3b_answer as select api.answer_followup(current_setting('tests.room_a')::uuid, 'no') as a;
select tests.clear_authentication();
select is((select a->>'status' from p3b_answer), 'ok', 'P3b answer_followup no answers ok (beyond the 120)');
select is(
  (select count(*) from public.user_titles ut where ut.profile_id = tests.uid('w2') and ut.title_id = tests.film(1)),
  0::bigint,
  'P3b w2 has no film history for film 1 (beyond the 120)'
);
select is(
  (select m.watched_answer::text from public.room_members m
   where m.id = tests.member_id('w2', current_setting('tests.room_a')::uuid)),
  'no',
  'P3b w2''s seat records the answer no (beyond the 120)'
);

-- P4, P3c: the export holds the profile and both games.
select tests.deal_game(2, 'x');
select set_config('tests.room_b', tests.room_id()::text, true);
select tests.authenticate_as('w1');
create temp table p4_join as select api.join_room(tests.room_code()) as a;
select tests.clear_authentication();
select is((select a->>'status' from p4_join), 'ok', 'P4 w1 joins room B');
select tests.vote_next('w1', 1);

select tests.authenticate_as('w1');
create temp table p4_export as select api.export_my_data() as e;
select tests.clear_authentication();
select is(
  (select e->'profile'->>'id' from p4_export),
  tests.uid('w1')::text,
  'P4 the export''s profile is w1''s'
);
select is(
  (select e->'profile' ? 'auth_user_id' from p4_export),
  false,
  'P4 the export''s profile has no auth_user_id'
);
select is((select jsonb_array_length(e->'games') from p4_export), 2, 'P4 the export has two games');
select is(
  (select (g->'votes'->0->>'answer') || '/' || (g->'votes'->0->>'tmdb_id') || '/' || jsonb_array_length(g->'votes')
   from p4_export, jsonb_array_elements(e->'games') g
   where g->>'room_id' = current_setting('tests.room_a')),
  'like/' || (select t.tmdb_id from public.titles t where t.id = tests.film(1)) || '/1',
  'P4 room A holds exactly one vote: w1''s like on film 1 (w2''s like is absent)'
);
select is(
  (select (g->'votes'->0->>'answer') || '/' || jsonb_array_length(g->'votes')
   from p4_export, jsonb_array_elements(e->'games') g
   where g->>'room_id' = current_setting('tests.room_b')),
  'nope/1',
  'P4 room B holds exactly one vote: w1''s nope'
);
select is(
  (select count(*) from p4_export, jsonb_array_elements(e->'film_history') h
   where (h->>'tmdb_id')::integer = (select t.tmdb_id from public.titles t where t.id = tests.film(1))
     and h->>'source' = 'app' and (h->>'seen')::boolean),
  1::bigint,
  'P4 film_history holds film 1 from the app, seen'
);

select tests.authenticate_as('w1');
create temp table p3c_answer as select api.answer_followup(current_setting('tests.room_b')::uuid, 'yes') as a;
select tests.clear_authentication();
select is((select a->>'status' from p3c_answer), 'not_found', 'P3c answer_followup on a room that is not done answers not_found (beyond the 120)');
select is(
  (select m.watched_answer is null from public.room_members m
   where m.id = tests.member_id('w1', current_setting('tests.room_b')::uuid)),
  true,
  'P3c w1''s seat in room B has no answer saved (beyond the 120)'
);

select * from finish();
rollback;

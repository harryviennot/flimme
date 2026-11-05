-- M8.9: internal.run_retention, the daily deletion job (operations.md#retention-jobs,
-- data-model.md#retention). One row just past each limit is deleted, one just inside is kept.
-- "After the room ends" is coalesce(ended_at, expires_at) of a done or abandoned room; a room
-- still in play is never touched. Times are moved with plain inserts and updates.

begin;
select plan(43);

select tests.create_catalog(6);
select tests.create_player('rt-host');

-- A room straight into p_state. A finished room ended p_age ago (through ended_at, or through
-- expires_at alone when p_via_expiry); a started one has started_at set.
create function pg_temp.mkroom(p_state text, p_age interval, p_started boolean default false,
                               p_via_expiry boolean default false) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.rooms (code, mode, state, country, host_id, started_at, ended_at, expires_at)
  values (lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0'), 'quick_match', p_state::public.room_state, 'FR',
          tests.uid('rt-host'),
          case when p_started then now() - p_age - interval '1 hour' end,
          case when p_state in ('done', 'abandoned') and not p_via_expiry then now() - p_age end,
          case when p_via_expiry then now() - p_age else now() + interval '1 hour' end)
  returning id into v_id;
  return v_id;
end $$;

create function pg_temp.mkseat(p_room uuid, p_name text) returns uuid language sql as $$
  insert into public.room_members (room_id, display_name, avatar_key) values (p_room, p_name, 'default') returning id
$$;

create function pg_temp.mkcard(p_room uuid, p_n integer) returns void language sql as $$
  insert into public.room_cards (room_id, title_id, group_score) values (p_room, tests.film(p_n), 1)
$$;

create function pg_temp.has_room(p_room uuid) returns boolean language sql as $$
  select exists (select 1 from public.rooms where id = p_room) $$;
create function pg_temp.has_card(p_room uuid, p_n integer) returns boolean language sql as $$
  select exists (select 1 from public.room_cards where room_id = p_room and title_id = tests.film(p_n)) $$;
create function pg_temp.has_deck(p_seat uuid, p_n integer) returns boolean language sql as $$
  select exists (select 1 from public.deck_entries where room_member_id = p_seat and title_id = tests.film(p_n)) $$;

-- Nothing old is lying about from elsewhere on the shared stack: the counts below are exact.
delete from public.rate_limits;

-- ---------------------------------------------------------------------------------------------
-- 1. Lobbies that never started: deleted 7 days after they end, with their seats.
-- ---------------------------------------------------------------------------------------------
create temp table ids as select
  pg_temp.mkroom('abandoned', interval '7 days 1 minute') as lobby_old,
  pg_temp.mkroom('abandoned', interval '6 days 23 hours') as lobby_new,
  pg_temp.mkroom('abandoned', interval '8 days', true) as started_old,
  pg_temp.mkroom('abandoned', interval '7 days 1 minute', false, true) as lobby_expiry_old,
  pg_temp.mkroom('lobby', interval '30 days') as lobby_open;
update public.rooms set expires_at = now() - interval '30 days' where id = (select lobby_open from ids);
create temp table seats as select
  pg_temp.mkseat((select lobby_old from ids), 'rt-a') as lobby_old_seat,
  pg_temp.mkseat((select lobby_new from ids), 'rt-b') as lobby_new_seat;

-- ---------------------------------------------------------------------------------------------
-- 2. Deck entries: 1 day after the room ends.
-- ---------------------------------------------------------------------------------------------
create temp table decks as select
  pg_temp.mkroom('done', interval '25 hours', true) as old_room,
  pg_temp.mkroom('done', interval '23 hours', true) as new_room,
  pg_temp.mkroom('swiping', interval '40 days', true) as live_room;
-- A swiping room the sweeper has not abandoned yet: no ended_at and an expiry long past.
update public.rooms set expires_at = now() - interval '40 days' where id = (select live_room from decks);
do $$ declare r record; s uuid;
begin
  for r in select old_room as room from decks union all select new_room from decks union all select live_room from decks loop
    s := pg_temp.mkseat(r.room, 'rt-d');
    perform pg_temp.mkcard(r.room, 1);
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source)
    values (r.room, s, tests.film(1), 1, 'ranked');
  end loop;
end $$;
create temp table deck_seats as select
  (select m.id from public.room_members m where m.room_id = d.old_room) as old_seat,
  (select m.id from public.room_members m where m.room_id = d.new_room) as new_seat,
  (select m.id from public.room_members m where m.room_id = d.live_room) as live_seat
from decks d;

-- ---------------------------------------------------------------------------------------------
-- 3. Room cards nobody voted on: 7 days after the room ends; voted cards and the pick stay.
-- ---------------------------------------------------------------------------------------------
create temp table cardrooms as select
  pg_temp.mkroom('done', interval '8 days', true) as old_room,
  pg_temp.mkroom('done', interval '6 days', true) as new_room;
do $$ declare o uuid := (select old_room from cardrooms); n uuid := (select new_room from cardrooms);
  s uuid; rd uuid;
begin
  -- film 1 no vote, 2 voted, 3 the pick, 4 a finale candidate
  for i in 1..4 loop perform pg_temp.mkcard(o, i); end loop;
  perform pg_temp.mkcard(n, 1);
  s := pg_temp.mkseat(o, 'rt-c');
  insert into public.votes (room_id, room_member_id, title_id, answer) values (o, s, tests.film(2), 'like');
  insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
  values (o, tests.film(3), 'unanimous', 2, 2, 1);
  insert into public.rounds (room_id, kind, stage, stage_closes_at) values (o, 'final_cut', 'closed', now()) returning id into rd;
  insert into public.round_candidates (round_id, title_id, seed) values (rd, tests.film(4), 1);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4. swipe_log and rec.requests: 13 months, by created_at; request items go with the request.
-- ---------------------------------------------------------------------------------------------
create temp table logroom as select pg_temp.mkroom('swiping', interval '0') as room_id;
insert into public.swipe_log (room_id, room_member_id, title_id, action, answer, created_at)
select r.room_id, gen_random_uuid(), tests.film(1), 'vote', 'like', now() - x.age
from logroom r, (values (interval '13 months 1 day'), (interval '12 months 29 days')) x(age);
create temp table reqs as
  with ins as (
    insert into rec.requests (room_id, kind, model_version, created_at)
    select r.room_id, 'start', 'test', now() - x.age
    from logroom r, (values (interval '13 months 1 day'), (interval '12 months 29 days')) x(age)
    returning id, created_at)
  select id, created_at < now() - interval '13 months' as is_old from ins;
insert into rec.request_items (request_id, room_member_id, title_id, position)
select id, gen_random_uuid(), tests.film(1), 1 from reqs;
select pg_temp.mkcard((select room_id from logroom), 1);
insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, request_id)
select l.room_id, pg_temp.mkseat(l.room_id, 'rt-r'), tests.film(1), 1, 'ranked', (select id from reqs where is_old)
from logroom l;

-- ---------------------------------------------------------------------------------------------
-- 5. import_rows unmatched: 30 days after the import finished (started, if it never did).
-- ---------------------------------------------------------------------------------------------
select tests.create_player('rt-imp');
select tests.connect_letterboxd('rt-imp', 'rt_viewer', false);
create temp table imps as
  with la as (select tests.linked_account_id('rt-imp') as id),
  ins as (
    insert into public.imports (linked_account_id, kind, status, started_at, finished_at)
    select la.id, 'export', 'done', now() - x.started, now() - x.finished
    from la, (values (interval '40 days', interval '31 days'),     -- old
                     (interval '40 days', interval '29 days'),     -- new
                     (interval '31 days', null::interval)) x(started, finished)  -- never finished, started 31 days ago
    returning id, finished_at, started_at)
  select id, coalesce(finished_at, started_at) as last_at from ins;
delete from public.import_rows;
create temp table imp_rows as
  with ins as (
    insert into public.import_rows (import_id, film_name, status)
    select i.id, 'rt row ' || s.status, s.status::public.import_row_status
    from imps i, (values ('unmatched'), ('matched'), ('pending')) s(status)
    returning id, import_id, status)
  select * from ins;

-- ---------------------------------------------------------------------------------------------
-- 6. rate_limits: 1 day by window_start. 7. member_reports: 12 months by created_at.
-- ---------------------------------------------------------------------------------------------
insert into public.rate_limits (key, window_start, hits) values
  ('rt:old', now() - interval '25 hours', 1), ('rt:new', now() - interval '23 hours', 1);

create temp table rep as
  with room as (select pg_temp.mkroom('done', interval '1 hour', true) as id)
  select room.id as room_id, pg_temp.mkseat(room.id, 'rt-x') as a, pg_temp.mkseat(room.id, 'rt-y') as b,
         pg_temp.mkseat(room.id, 'rt-z') as c
  from room;
insert into public.member_reports (room_id, reporter_member_id, reported_member_id, reason, created_at)
select room_id, a, b, 'spam'::public.report_reason, now() - interval '12 months 1 day' from rep
union all select room_id, a, c, 'spam'::public.report_reason, now() - interval '11 months' from rep;

-- ---------------------------------------------------------------------------------------------
-- The run.
-- ---------------------------------------------------------------------------------------------
create temp table run1 as select internal.run_retention() as r;

-- Lobbies
select ok(not pg_temp.has_room((select lobby_old from ids)), 'an abandoned lobby ended 7 days 1 minute ago is deleted');
select is((select count(*) from public.room_members where id = (select lobby_old_seat from seats)), 0::bigint, 'and its seat goes with it');
select ok(pg_temp.has_room((select lobby_new from ids)), 'one ended 6 days 23 hours ago stays');
select is((select count(*) from public.room_members where id = (select lobby_new_seat from seats)), 1::bigint, 'with its seat');
select ok(pg_temp.has_room((select started_old from ids)), 'an abandoned room that had started stays');
select ok(not pg_temp.has_room((select lobby_expiry_old from ids)), 'a lobby with no ended_at counts from expires_at');
select ok(pg_temp.has_room((select lobby_open from ids)), 'a lobby still open is never touched, however old its expiry');

-- Deck entries
select ok(not pg_temp.has_deck((select old_seat from deck_seats), 1), 'deck entries of a room ended 25 hours ago are deleted');
select ok(pg_temp.has_deck((select new_seat from deck_seats), 1), 'of a room ended 23 hours ago, kept');
select ok(pg_temp.has_deck((select live_seat from deck_seats), 1), 'of a room still swiping, kept whatever their age');
select ok(pg_temp.has_card((select old_room from decks), 1), 'the room card under a deleted deck entry stays (it is under 7 days)');

-- Room cards
select ok(not pg_temp.has_card((select old_room from cardrooms), 1), 'a room card with no votes in a room ended 8 days ago is deleted');
select ok(pg_temp.has_card((select old_room from cardrooms), 2), 'one with a vote stays');
select ok(pg_temp.has_card((select old_room from cardrooms), 3), 'the pick''s card stays');
select ok(pg_temp.has_card((select old_room from cardrooms), 4), 'a finale candidate''s card stays');
select ok(pg_temp.has_card((select live_room from decks), 1), 'an unvoted card in a room still swiping stays, even with an expiry 40 days past');
select ok(pg_temp.has_card((select new_room from cardrooms), 1), 'a card with no votes in a room ended 6 days ago stays');
select is((select count(*) from public.votes where room_id = (select old_room from cardrooms)), 1::bigint, 'the vote is untouched');

-- swipe_log and rec.requests
select is((select count(*) from public.swipe_log where room_id = (select room_id from logroom)), 1::bigint, 'swipe_log: the row 13 months 1 day old is deleted, 12 months 29 days stays');
select ok((select created_at > now() - interval '13 months' from public.swipe_log where room_id = (select room_id from logroom)), 'and the one left is the newer');
select is((select count(*) from rec.requests where id in (select id from reqs)), 1::bigint, 'rec.requests: the old request is deleted, the newer stays');
select is((select count(*) from rec.request_items where request_id in (select id from reqs)), 1::bigint, 'and its items went with it');
select is((select request_id from public.deck_entries where room_id = (select room_id from logroom)), null::bigint, 'a deck entry that pointed at it now points at nothing');

-- import_rows
select is((select count(*) from public.import_rows r join imps i on i.id = r.import_id
           where r.status = 'unmatched' and i.last_at < now() - interval '30 days'), 0::bigint, 'unmatched import rows of an import finished 31 days ago (or started, never finished) are deleted');
select is((select count(*) from public.import_rows r join imps i on i.id = r.import_id
           where r.status = 'unmatched' and i.last_at >= now() - interval '30 days'), 1::bigint, 'unmatched rows of an import finished 29 days ago stay');
select is((select count(*) from public.import_rows r join imps i on i.id = r.import_id
           where r.status <> 'unmatched'), 6::bigint, 'matched and pending rows stay, old or not');

-- rate_limits
select is((select count(*) from public.rate_limits where key = 'rt:old'), 0::bigint, 'a rate_limits row 25 hours old is deleted');
select is((select count(*) from public.rate_limits where key = 'rt:new'), 1::bigint, 'one 23 hours old stays');

-- member_reports
select is((select count(*) from public.member_reports where reporter_member_id = (select a from rep) and reported_member_id = (select b from rep)),
          0::bigint, 'a report 12 months 1 day old is deleted');
select is((select count(*) from public.member_reports where reporter_member_id = (select a from rep) and reported_member_id = (select c from rep)),
          1::bigint, 'one 11 months old stays');

-- The answer and the ingest_runs row
select is((select r->'lobbies'->>'deleted' from run1), '2', 'the answer counts the lobbies deleted');
select is((select r->'rate_limits'->>'deleted' from run1), '1', 'and the rate limits');
select is((select r->'member_reports'->>'deleted' from run1), '1', 'and the reports');
select is((select (r->'lobbies'->>'capped')::boolean from run1), false, 'a rule under its cap says capped false');

select is((select count(*) from public.ingest_runs where id = (select (r->>'run_id')::bigint from run1) and kind = 'retention' and finished_at is not null),
          1::bigint, 'one finished ingest_runs row of kind retention');
select is((select stats from public.ingest_runs where id = (select (r->>'run_id')::bigint from run1)),
          (select r - 'run_id' from run1), 'whose stats match the returned counts');
select lives_ok($$ insert into public.ingest_runs (kind) values ('guest_cleanup') $$, 'guest_cleanup is an allowed kind');

-- A second run straight after deletes nothing.
create temp table run2 as select internal.run_retention() as r;
select is((select count(*) from run2, jsonb_each(r) e where e.key <> 'run_id' and (e.value->>'deleted')::integer > 0),
          0::bigint, 'a second run straight after deletes nothing');

-- The cap
insert into public.rate_limits (key, window_start, hits)
select 'rt:cap' || n, now() - interval '3 days', 1 from generate_series(1, 3) n;
create temp table run3 as select internal.run_retention(2) as r;
select is((select r->'rate_limits' from run3), '{"deleted": 2, "capped": true}'::jsonb, 'given 3 rows over a cap of 2, 2 are deleted and capped is true');
select is((select count(*) from public.rate_limits where key like 'rt:cap%'), 1::bigint, 'and one waits for the next night');
create temp table run4 as select internal.run_retention(2) as r;
select is((select r->'rate_limits' from run4), '{"deleted": 1, "capped": false}'::jsonb, 'the next run takes the rest, not capped');

-- Access
select ok(not (has_function_privilege('authenticated', 'internal.run_retention(integer)', 'execute')
               or has_function_privilege('anon', 'internal.run_retention(integer)', 'execute')),
          'authenticated and anon cannot execute it');
select ok(not (has_function_privilege('app_server', 'internal.run_retention(integer)', 'execute')
               or has_function_privilege('app_http', 'internal.run_retention(integer)', 'execute')),
          'nor can app_server or app_http');

select * from finish();
rollback;

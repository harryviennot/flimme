-- M8.8: internal.delete_inactive_guests, the daily guest cleanup (security.md#guest-accounts,
-- decisions.md #194). A guest is anonymous and unseen for 90 days: the latest of its account's
-- created_at, its profile's created_at and last_seen_at, and its seats' last_active_at.

begin;
select plan(21);

select tests.create_catalog(2);
select tests.create_player('gc-host');

-- A user whose every sign of life is p_age old. Its account and profile are backdated.
create function pg_temp.mkguest(p_name text, p_age interval, p_anonymous boolean default true) returns uuid language plpgsql as $$
declare v_id uuid := tests.create_player(p_name, 'FR', p_anonymous);
begin
  update auth.users set created_at = now() - p_age where id = v_id;
  update public.profiles set created_at = now() - p_age where id = v_id;
  return v_id;
end $$;

create function pg_temp.mkroom(p_state text) returns uuid language sql as $$
  insert into public.rooms (code, mode, state, country, host_id, expires_at)
  values (lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0'), 'quick_match', p_state::public.room_state, 'FR',
          tests.uid('gc-host'), now() + interval '1 hour')
  returning id
$$;

create function pg_temp.seat(p_room uuid, p_profile uuid, p_name text, p_age interval) returns uuid language sql as $$
  insert into public.room_members (room_id, profile_id, display_name, avatar_key, last_active_at)
  values (p_room, p_profile, p_name, 'default', now() - p_age) returning id
$$;

create function pg_temp.has_user(p_name text) returns boolean language sql as $$
  select exists (select 1 from auth.users where id = tests.uid(p_name)) $$;
create function pg_temp.has_profile(p_name text) returns boolean language sql as $$
  select exists (select 1 from public.profiles where id = tests.uid(p_name)) $$;

create temp table room as select pg_temp.mkroom('done') as id;

-- 1. Never joined, 91 days.
select pg_temp.mkguest('gc-never', interval '91 days');
-- 2. A recent last_seen_at keeps an old guest.
select pg_temp.mkguest('gc-seen', interval '91 days');
update public.profiles set last_seen_at = now() - interval '10 days' where id = tests.uid('gc-seen');
-- 3. A recent seat keeps an old guest; an old seat does not, and stays anonymous with its vote.
select pg_temp.mkguest('gc-seat-new', interval '200 days');
select pg_temp.seat((select id from room), tests.uid('gc-seat-new'), 'gc-seat-new', interval '30 days');
select pg_temp.mkguest('gc-seat-old', interval '200 days');
create temp table old_seat as
  select pg_temp.seat((select id from room), tests.uid('gc-seat-old'), 'gc-seat-old', interval '91 days') as id;
insert into public.room_cards (room_id, title_id, group_score) values ((select id from room), tests.film(1), 1);
insert into public.votes (room_id, room_member_id, title_id, answer)
  values ((select id from room), (select id from old_seat), tests.film(1), 'like');
-- 4. Not anonymous.
select pg_temp.mkguest('gc-registered', interval '400 days', false);
-- 5. Boundary.
select pg_temp.mkguest('gc-89', interval '89 days');
-- 6. A guest hosting a room still in play is skipped.
select pg_temp.mkguest('gc-hosting', interval '120 days');
create temp table live as select pg_temp.mkroom('swiping') as id;
update public.rooms set host_id = tests.uid('gc-hosting') where id = (select id from live);
-- 7. A guest with an account and no profile counts from the account's date.
insert into auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at)
  values (tests.uid('gc-noprofile'), 'authenticated', 'authenticated', true, '{}', '{}', now() - interval '95 days');
delete from public.profiles where id = tests.uid('gc-noprofile');

select is((internal.delete_inactive_guests())->>'deleted', '3', 'a run answers how many it deleted');

select ok(not pg_temp.has_user('gc-never') and not pg_temp.has_profile('gc-never'), 'a guest created 91 days ago who never joined is deleted, profile included');
select ok(pg_temp.has_user('gc-seen') and pg_temp.has_profile('gc-seen'), 'a guest with last_seen_at 10 days ago is kept');
select ok(pg_temp.has_user('gc-seat-new'), 'a guest whose seat was active 30 days ago is kept');
select ok(not pg_temp.has_user('gc-seat-old') and not pg_temp.has_profile('gc-seat-old'), 'a guest whose seat was active 91 days ago is deleted');
select is((select display_name from public.room_members where id = (select id from old_seat)), '', 'its seat stays, with no name');
select is((select profile_id from public.room_members where id = (select id from old_seat)), null, 'and no profile');
select is((select count(*) from public.votes where room_member_id = (select id from old_seat)), 1::bigint, 'and its vote');
select ok(pg_temp.has_user('gc-registered') and pg_temp.has_profile('gc-registered'), 'a registered user inactive for a year is never touched');
select ok(pg_temp.has_user('gc-89'), 'a guest at 89 days is kept');
select ok(pg_temp.has_user('gc-hosting'), 'a guest who hosts a room in play is skipped');
select ok(not pg_temp.has_user('gc-noprofile'), 'a guest without a profile counts from its account date');

-- The run record
select is((select count(*) from public.ingest_runs
           where kind = 'guest_cleanup' and finished_at is not null and stats = '{"deleted": 3, "capped": false}'),
          1::bigint, 'the run left one finished guest_cleanup row with its counts');
select is((internal.delete_inactive_guests())->>'deleted', '0', 'a second run straight after deletes nothing');
select is((select count(*) from public.ingest_runs where kind = 'guest_cleanup'), 2::bigint, 'and records its own row');

-- The cap
select pg_temp.mkguest('gc-cap-' || n, interval '100 days') from generate_series(1, 3) n;
create temp table capped as select internal.delete_inactive_guests(2) as r;
select is((select r->>'deleted' from capped), '2', 'with 3 inactive guests and a limit of 2, 2 are deleted');
select is((select r->>'capped' from capped), 'true', 'and the run says it was capped');
select is((select count(*) from auth.users where id in (tests.uid('gc-cap-1'), tests.uid('gc-cap-2'), tests.uid('gc-cap-3'))),
          1::bigint, 'one is left for the next run');
select throws_ok($$select internal.delete_inactive_guests(0)$$, 'P0001', 'delete_inactive_guests: the limit must be at least 1',
                 'a limit under 1 raises');

-- Access
select ok(not (has_function_privilege('authenticated', 'internal.delete_inactive_guests(integer)', 'execute')
               or has_function_privilege('anon', 'internal.delete_inactive_guests(integer)', 'execute')),
          'authenticated and anon cannot execute it');
select ok(not (has_function_privilege('app_server', 'internal.delete_inactive_guests(integer)', 'execute')
               or has_function_privilege('app_http', 'internal.delete_inactive_guests(integer)', 'execute')),
          'nor can app_server or app_http');

select * from finish();
rollback;

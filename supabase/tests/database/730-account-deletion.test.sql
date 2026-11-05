-- M8.5: deleting an auth user leaves nothing about the player except anonymous seats
-- (security.md#account-deletion-and-data-export, data-model.md#deleting-an-account-exporting-data).
-- The server deletes the auth user through the admin API; here the same delete runs in SQL.

begin;
select plan(29);

select tests.create_catalog(40);

-- One room: d1 hosts with d2.
select tests.deal_game(2, 'd', 'swiping');
select set_config('tests.room_a', tests.room_id()::text, true);
select tests.vote('d1', 1, 'like');
select tests.vote('d1', 2, 'nope');
select tests.vote('d2', 1, 'like');

insert into public.profile_providers (profile_id, provider_id) values (tests.uid('d1'), 9001), (tests.uid('d2'), 9001)
  on conflict do nothing;
insert into public.consents (profile_id, kind, version, choice) values
  (tests.uid('d1'), 'analytics', 'wording-d1', 'on'),
  (tests.uid('d2'), 'analytics', 'wording-d2', 'on');
insert into public.user_titles (profile_id, title_id, source, seen) values
  (tests.uid('d1'), tests.film(3), 'app', true),
  (tests.uid('d2'), tests.film(3), 'app', true);
insert into public.taste_profiles (profile_id) values (tests.uid('d1')), (tests.uid('d2'));
update public.profiles set display_name = 'Zorblax' where id = tests.uid('d1');
update public.room_members set display_name = 'Zorblax', avatar_key = 'a7' where id = tests.member_id('d1');
update public.room_members set display_name = 'Quuxell', avatar_key = 'a8' where id = tests.member_id('d2');

-- A Letterboxd link with an import, for d1.
select tests.connect_letterboxd('d1');

-- A finale round with a ballot from each, a report each way, and a seat d1 controls.
insert into public.rounds (id, room_id, kind, stage, stage_closes_at)
values ('00000000-0000-4000-8000-0000000000a1', tests.room_id(), 'final_cut', 'veto', now() + interval '1 minute');
insert into public.round_ballots (round_id, room_member_id, kind, title_id) values
  ('00000000-0000-4000-8000-0000000000a1', tests.member_id('d1'), 'veto', tests.film(1)),
  ('00000000-0000-4000-8000-0000000000a1', tests.member_id('d2'), 'veto', tests.film(2));
insert into public.member_reports (room_id, reporter_member_id, reported_member_id, reason) values
  (tests.room_id(), tests.member_id('d1'), tests.member_id('d2'), 'offensive_name'),
  (tests.room_id(), tests.member_id('d2'), tests.member_id('d1'), 'offensive_name');
insert into public.room_members (id, room_id, profile_id, controlled_by, role, display_name, avatar_key)
values ('00000000-0000-4000-8000-0000000000c1', tests.room_id(), null, tests.uid('d1'), 'guest', 'Kid', 'a1');

-- Rate-limit rows: d1's by id (several actions), an IP row, and d2's.
insert into public.rate_limits (key, window_start, hits) values
  ('join:p:' || tests.uid('d1'), now(), 1),
  ('join_failed:p:' || tests.uid('d1'), now(), 1),
  ('export:p:' || tests.uid('d1'), now(), 1),
  ('calibration:p:' || tests.uid('d1'), now(), 1),
  ('preview:p:' || tests.uid('d1'), now(), 1),
  ('report:p:' || tests.uid('d1'), now(), 1),
  ('someday_new:p:' || tests.uid('d1'), now(), 1),
  ('join:ip:abcdef0123456789', now(), 1),
  ('join:p:' || tests.uid('d2'), now(), 1);

create temp table seat as select tests.member_id('d1') as d1, tests.member_id('d2') as d2;
create temp table before_counts as select
  (select count(*) from public.rate_limits where key like '%:p:' || tests.uid('d2')::text) as d2_limits,
  (select count(*) from public.votes where room_member_id = tests.member_id('d1')) as d1_votes,
  (select count(*) from public.round_ballots where room_member_id = tests.member_id('d1')) as d1_ballots,
  (select count(*) from public.member_reports) as reports,
  (select count(*) from public.room_members) as seats;

select is((select count(*) from public.linked_accounts where profile_id = tests.uid('d1')), 1::bigint, 'setup: d1 has a linked account');

delete from auth.users where id = tests.uid('d1');

-- Everything personal is gone.
select is((select count(*) from public.profiles where id = tests.uid('d1')), 0::bigint, 'the profile is gone');
select is((select count(*) from public.profile_providers where profile_id = tests.uid('d1')), 0::bigint, 'services are gone');
select is((select count(*) from public.consents where profile_id = tests.uid('d1')), 0::bigint, 'consents are gone');
select is((select count(*) from public.user_titles where profile_id = tests.uid('d1')), 0::bigint, 'film history is gone');
select is((select count(*) from public.taste_profiles where profile_id = tests.uid('d1')), 0::bigint, 'the taste profile is gone');
select is((select count(*) from public.linked_accounts where profile_id = tests.uid('d1')), 0::bigint, 'linked accounts are gone');
select is((select count(*) from public.imports i where not exists (select 1 from public.linked_accounts l where l.id = i.linked_account_id)), 0::bigint, 'imports are gone with their linked account');
select is((select count(*) from public.imports i join public.linked_accounts l on l.id = i.linked_account_id where l.profile_id = tests.uid('d1')), 0::bigint, 'no import is left for d1');

-- The seat stays, anonymous.
select is((select count(*) from public.room_members where id = (select d1 from seat)), 1::bigint, 'the seat remains');
select ok((select profile_id is null and controlled_by is null from public.room_members where id = (select d1 from seat)), 'the seat has no profile_id and no controlled_by');
select is((select display_name from public.room_members where id = (select d1 from seat)), '', 'the seat has lost its name');
select is((select avatar_key from public.room_members where id = (select d1 from seat)), 'default', 'the seat has the default avatar');
select ok((select profile_id is null and controlled_by is null and display_name = '' from public.room_members where id = '00000000-0000-4000-8000-0000000000c1'),
  'the seat d1 controlled has no controller');
select is((select host_id from public.rooms where id = current_setting('tests.room_a')::uuid), null, 'the room has no host');

-- Votes, ballots and reports stay.
select is((select count(*) from public.votes where room_member_id = (select d1 from seat)), (select d1_votes from before_counts), 'the votes remain');
select is((select count(*) from public.round_ballots where room_member_id = (select d1 from seat)), (select d1_ballots from before_counts), 'the ballots remain');
select is((select count(*) from public.member_reports), (select reports from before_counts), 'both reports remain');
select is((select count(*) from public.room_members), (select seats from before_counts), 'no seat was deleted');

-- Rate limits.
select is((select count(*) from public.rate_limits where key like '%:p:' || tests.uid('d1')::text), 0::bigint, 'no rate-limit row holds the profile id');
select is((select count(*) from public.rate_limits where key = 'join:ip:abcdef0123456789'), 1::bigint, 'an IP row stays');
select is((select count(*) from public.rate_limits where key like '%:p:' || tests.uid('d2')::text), (select d2_limits from before_counts), 'the other player''s row stays');

-- The other player is untouched.
select is((select count(*) from public.profiles where id = tests.uid('d2')), 1::bigint, 'd2 keeps the profile');
select is((select count(*) from public.profile_providers where profile_id = tests.uid('d2')), 1::bigint, 'd2 keeps the services');
select is((select count(*) from public.consents where profile_id = tests.uid('d2')), 1::bigint, 'd2 keeps the consent');
select is((select count(*) from public.user_titles where profile_id = tests.uid('d2')), 1::bigint, 'd2 keeps the film history');
select is((select display_name from public.room_members where id = (select d2 from seat)), 'Quuxell', 'd2 keeps the seat name');
select is((select profile_id from public.room_members where id = (select d2 from seat)), tests.uid('d2'), 'd2 keeps the seat''s profile');

-- Deleting again (a retry) finds nothing and does not fail.
select lives_ok($$ delete from auth.users where id = tests.uid('d1') $$, 'a second delete is quiet');

select * from finish();
rollback;

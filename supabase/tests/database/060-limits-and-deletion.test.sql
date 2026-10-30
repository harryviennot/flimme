-- Join attempts are limited, and deleting an account removes the person but not
-- the games (data-model.md#create-and-join and #deleting-an-account-exporting-data).
-- The rate limit is tested through the answers only, never through the rows of
-- rate_limits. Nothing waits: now() is fixed inside a transaction.

begin;
select plan(12);

-- D2: the 11th join attempt in 10 minutes is refused, even with the real code.
select tests.create_room(2);
select tests.create_player('dana');
select tests.authenticate_as('dana');
select is(
  (select count(*) filter (where api.join_room('000000')->>'status' = 'not_found') from generate_series(1, 10)),
  10::bigint,
  'D2 ten attempts with a wrong code each answer not_found'
);
select is((select api.join_room(tests.room_code())->>'status'), 'rate_limited',
  'D2 the 11th attempt, with the real code, answers rate_limited');
select tests.clear_authentication();
select is((select count(*) from public.room_members where profile_id = tests.uid('dana')), 0::bigint,
  'D2 the refused player has no seat');

-- Setup for D3 and D4: p2 holds a seat in room 2 and has personal data everywhere.
select tests.create_room(2, 'quick_match', 'FR', 'd');
select tests.create_provider(9001, 'Test Service A');
select tests.create_title('Test Film One');
insert into public.profile_providers (profile_id, provider_id) values (tests.uid('d2'), 9001);
insert into public.consents (profile_id, kind, version) values (tests.uid('d2'), 'analytics', 'test-1');
with c as (
  insert into public.consents (profile_id, kind, version) values (tests.uid('d2'), 'letterboxd_import', 'test-1')
  returning id
)
insert into public.linked_accounts (profile_id, provider, username, consent_id)
select tests.uid('d2'), 'letterboxd', 'test_user', c.id from c;
insert into public.user_titles (profile_id, title_id, source, seen)
values (tests.uid('d2'), tests.title_id('Test Film One'), 'app', true);
insert into public.taste_profiles (profile_id) values (tests.uid('d2'));
-- A chosen avatar, so D4 proves the scrub resets it.
update public.room_members set avatar_key = 'fox' where id = tests.member_id('d2');
insert into public.room_cards (room_id, title_id, group_score)
values (tests.room_id(), tests.title_id('Test Film One'), 1);
insert into public.votes (room_id, room_member_id, title_id, answer)
values (tests.room_id(), tests.member_id('d2'), tests.title_id('Test Film One'), 'like');

select is(
  (select count(*) from (
     select 1 from public.profiles where id = tests.uid('d2')
     union all select 1 from public.profile_providers where profile_id = tests.uid('d2')
     union all select 1 from public.consents where profile_id = tests.uid('d2')
     union all select 1 from public.linked_accounts where profile_id = tests.uid('d2')
     union all select 1 from public.user_titles where profile_id = tests.uid('d2')
     union all select 1 from public.taste_profiles where profile_id = tests.uid('d2')
   ) x),
  7::bigint,
  'D3 control: before deletion the player has data in all six tables (two consents)'
);

delete from auth.users where id = tests.uid('d2');

-- D3: the person is gone.
select is((select count(*) from public.profiles where id = tests.uid('d2')), 0::bigint, 'D3 the profile is gone');
select is((select count(*) from public.profile_providers where profile_id = tests.uid('d2')), 0::bigint,
  'D3 the services are gone');
select is((select count(*) from public.consents where profile_id = tests.uid('d2')), 0::bigint,
  'D3 the consents are gone');
select is((select count(*) from public.linked_accounts where profile_id = tests.uid('d2')), 0::bigint,
  'D3 the linked account is gone');
select is((select count(*) from public.user_titles where profile_id = tests.uid('d2')), 0::bigint,
  'D3 the film history is gone');
select is((select count(*) from public.taste_profiles where profile_id = tests.uid('d2')), 0::bigint,
  'D3 the taste profile is gone');

-- D4: the games stay, anonymous. The seat is found by what is left of it.
select is(
  (select m.profile_id is null and m.controlled_by is null and m.display_name = ''
          and m.avatar_key = 'default' and m.role = 'guest'
   from public.room_members m where m.room_id = tests.room_id() and m.profile_id is null),
  true,
  'D4 the seat stays with no profile, no controller, no name and the default avatar'
);
select is(
  (select count(*) from public.votes v join public.room_members m on m.id = v.room_member_id
   where m.room_id = tests.room_id() and m.profile_id is null and v.answer = 'like'),
  1::bigint,
  'D4 the vote stays on the anonymous seat'
);

select * from finish();
rollback;

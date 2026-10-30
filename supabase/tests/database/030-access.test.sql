-- Who can read and change what: the rules of data-model.md#who-sees-what.
-- Every denial has a positive control on the same data (someone sees it, or the
-- superuser counts at least one), so an empty table cannot pass a test by itself.
-- Revoked tables and functions raise 42501; tables filtered by row-level
-- security answer with no rows.

begin;
select plan(25);

-- Setup, as the superuser: a room of p1 (host) and p2, a stranger carol who is
-- named but has no seat, one film in the room's pool and in p1's deck.
select tests.create_room(2);
select tests.create_player('carol');
select tests.create_title('Test Film One');
select tests.create_provider(9001, 'Test Service A');
insert into public.genres (id, slug, names) values (9001, 'test-genre', '{"en": "Test", "fr": "Essai"}');
insert into public.title_availability (title_id, country, provider_id, kind)
values (tests.title_id('Test Film One'), 'FR', 9001, 'subscription');
insert into public.room_cards (room_id, title_id, group_score)
values (tests.room_id(), tests.title_id('Test Film One'), 1);
insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source)
values (tests.room_id(), tests.member_id('p1'), tests.title_id('Test Film One'), 1, 'ranked');
insert into public.votes (room_id, room_member_id, title_id, answer)
values (tests.room_id(), tests.member_id('p1'), tests.title_id('Test Film One'), 'like'),
       (tests.room_id(), tests.member_id('p2'), tests.title_id('Test Film One'), 'nope');

-- A1
select tests.authenticate_as('p1');
select throws_ok(
  $$update public.profiles set display_name = 'Hacked' where id = tests.uid('p1')$$,
  '42501', null,
  'A1 a player cannot update a profile directly'
);
select tests.clear_authentication();
select is(
  (select display_name from public.profiles where id = tests.uid('p1')), 'p1',
  'A1 the name is unchanged after the refused update'
);

-- A2
select cmp_ok((select count(*) from public.titles where id = tests.title_id('Test Film One')), '=', 1::bigint,
  'A2 control: the superuser sees the film');
select tests.authenticate_as('p1');
select throws_ok($$select count(*) from public.titles$$, '42501', null,
  'A2 a player cannot read the catalog table titles');
select throws_ok($$select count(*) from public.title_availability$$, '42501', null,
  'A2 a player cannot read the catalog table title_availability');

-- A3
select tests.clear_authentication();
select cmp_ok((select count(*) from public.room_cards where room_id = tests.room_id()), '>=', 1::bigint,
  'A3 control: the superuser sees the room card');
select cmp_ok((select count(*) from public.deck_entries where room_id = tests.room_id()), '>=', 1::bigint,
  'A3 control: the superuser sees the deck entry');
select tests.authenticate_as('p1');
select throws_ok($$select count(*) from public.room_cards$$, '42501', null,
  'A3 a seated player cannot read room_cards');
select throws_ok($$select count(*) from public.deck_entries$$, '42501', null,
  'A3 a seated player cannot read deck_entries');

-- A4
select throws_ok($$select count(*) from rec.requests$$, '42501', null,
  'A4 a player cannot read rec.requests');
select throws_ok($$select count(*) from rec.models$$, '42501', null,
  'A4 a player cannot read rec.models');

-- A5
select throws_ok(
  $$select internal.deal_cards(tests.room_id(), '{}')$$,
  '42501', null,
  'A5 a player cannot call internal.deal_cards'
);

-- A6
select results_eq(
  $$select id, slug from api.genres where id = 9001$$,
  $$values (9001, 'test-genre')$$,
  'A6 api.genres returns the fixture genre'
);
select results_eq(
  $$select provider_id, country::text from api.country_providers where provider_id = 9001$$,
  $$values (9001, 'FR')$$,
  'A6 api.country_providers returns the fixture service in FR'
);
select is((select count(*) from api.game_modes where slug = 'quick_match'), 1::bigint,
  'A6 api.game_modes returns quick_match');
select is((select count(*) from api.app_config where key = 'min_app_version'), 1::bigint,
  'A6 api.app_config returns min_app_version');

-- A7
select tests.authenticate_as('carol');
select is((select count(*) from api.rooms), 0::bigint, 'A7 a non-member sees no room through api.rooms');
select is((select count(*) from public.rooms), 0::bigint, 'A7 a non-member sees no room in public.rooms');
select tests.authenticate_as('p2');
select is((select count(*) from api.rooms where id = tests.room_id()), 1::bigint, 'A7 control: a member sees the room');

-- A8
select tests.authenticate_as('carol');
select is((select count(*) from api.room_seats) + (select count(*) from public.room_members), 0::bigint,
  'A8 a non-member sees no seat in api.room_seats or public.room_members');
select tests.authenticate_as('p2');
select is(
  (select count(*) from api.room_seats) || '/' || (select count(*) from public.room_members),
  '2/2',
  'A8 control: a member sees both seats in both'
);

-- A9
select is(
  (select count(*) from public.profiles) || '/' || (select count(*) from api.my_profile)
    || '/' || (select min(id::text) from api.my_profile),
  '1/1/' || tests.uid('p2'),
  'A9 a player sees exactly one profile, their own'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.profiles where id in (tests.uid('p1'), tests.uid('p2'), tests.uid('carol'))),
  3::bigint,
  'A9 control: the superuser sees all three profiles'
);

-- A10
select tests.authenticate_as('p1');
select is(
  (select string_agg(answer::text, ',') from api.my_votes)
    || '/' || (select string_agg(answer::text, ',') from public.votes),
  'like/like',
  'A10 p1 sees only their own like, never the nope'
);
select tests.authenticate_as('p2');
select is(
  (select string_agg(answer::text, ',') from api.my_votes)
    || '/' || (select string_agg(answer::text, ',') from public.votes),
  'nope/nope',
  'A10 p2 sees only their own nope'
);

select * from finish();
rollback;

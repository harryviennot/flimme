-- M2.4: the catalog columns from tmdb.md#changes-to-the-data-model, and free
-- services counting for rooms (decisions.md: "free services count for every
-- room unless the host turns them off"). Runs on the lite database and on the
-- real stack, on the loaded seed.

begin;
select plan(29);

-- T12: the seed. Checked first, before the fixtures below change anything.
select is(
  (select count(*)::integer from public.provider_regions
   where country = 'FR' and provider_id between 8001 and 8010 and is_listed),
  7, 'T12 the seed lists 7 services in FR');
select is(
  (select count(*)::integer from public.provider_regions
   where country = 'FR' and provider_id between 8001 and 8010 and free_for_all),
  3, 'T12 the seed has 3 free services in FR');

-- The seed's free services would join every FR room; switch them off so the
-- fixtures decide (rolled back with the test).
update public.provider_regions set free_for_all = false;

select tests.create_provider(9101, 'Test Service A');
select tests.create_provider(9102, 'Test Service B');
select tests.create_provider(9103, 'Test Service F');
update public.provider_regions set free_for_all = true where provider_id = 9103 and country = 'FR';
-- A free service of another country.
select tests.create_provider(9104, 'Test Service G', 'DE');
update public.provider_regions set free_for_all = true where provider_id = 9104 and country = 'DE';

select tests.create_room(2);
update public.room_members set provider_ids = '{9101}' where id = tests.member_id('p1');
update public.room_members set provider_ids = '{9101,9102}' where id = tests.member_id('p2');

-- T1: a seat with A in FR, and F free in FR.
update public.room_members set provider_ids = '{9101}' where id = tests.member_id('p2');
update public.room_members set left_at = now() where id = tests.member_id('p2');
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()),
  '{9101,9103}'::integer[], 'T1 free services join the seats'' services');

-- T2: switched off.
update public.rooms set include_free_services = false where id = tests.room_id();
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()),
  '{9101}'::integer[], 'T2 include_free_services false leaves only the seats'' services');

-- T3: every_member with seats {A, B} and {A}.
update public.room_members set left_at = null, provider_ids = '{9101,9102}' where id = tests.member_id('p2');
update public.room_members set provider_ids = '{9101}' where id = tests.member_id('p1');
update public.rooms set include_free_services = true, service_rule = 'every_member' where id = tests.room_id();
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()),
  '{9101,9103}'::integer[], 'T3 every_member: the shared service plus the free one');

-- T4: a free service of another country is not added (9104 is free in DE only).
select ok(9104 <> all (coalesce((select provider_ids from public.rooms where id = tests.room_id()), '{}'::integer[])),
  'T4 a free service of another country is not added');

-- T5: a seat that also picked F: F appears once, sorted.
update public.room_members set provider_ids = '{9103,9101}' where id = tests.member_id('p1');
update public.room_members set provider_ids = '{9103,9101}' where id = tests.member_id('p2');
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()),
  '{9101,9103}'::integer[], 'T5 a service both free and picked appears once, sorted');

-- T6: no active seats.
update public.room_members set left_at = now() where room_id = tests.room_id();
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()),
  '{9103}'::integer[], 'T6 no active seats: only the free service when on');
update public.rooms set include_free_services = false where id = tests.room_id();
select internal.refresh_room_providers(tests.room_id());
select is((select provider_ids from public.rooms where id = tests.room_id()),
  '{}'::integer[], 'T6 no active seats: nothing when off');

-- T7: the picker shows listed services only.
update public.provider_regions set is_listed = true where provider_id = 9101 and country = 'FR';
select is(
  (select count(*)::integer from api.country_providers where provider_id = 9101),
  1, 'T7 api.country_providers shows a listed service');
select is(
  (select count(*)::integer from api.country_providers where provider_id = 9102),
  0, 'T7 api.country_providers hides an unlisted service (the default for new ones)');

-- T8: providers.parent_id.
select lives_ok($$update public.providers set parent_id = 9101 where id = 9102$$,
  'T8 a variant can point at its main service');
select throws_ok($$update public.providers set parent_id = id where id = 9102$$,
  '23514', null, 'T8 parent_id refuses itself');
select throws_ok($$update public.providers set parent_id = 987654321 where id = 9102$$,
  '23503', null, 'T8 parent_id refuses an unknown service');

-- T9: ingest_runs kinds.
select lives_ok(
  $$insert into public.ingest_runs (kind) values
    ('backfill'), ('availability_sweep'), ('popularity_daily'), ('changes_daily'),
    ('details_weekly'), ('details_monthly'), ('reference_weekly'), ('embeddings'), ('moods')$$,
  'T9 ingest_runs accepts the nine kinds');
select throws_ok($$insert into public.ingest_runs (kind) values ('providers_daily')$$,
  '23514', null, 'T9 ingest_runs refuses providers_daily');
select is((select stats from public.ingest_runs where kind = 'moods' order by id desc limit 1),
  '{}'::jsonb, 'T9 ingest_runs.stats defaults to an empty object');

-- T10: defaults.
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'rooms' and column_name = 'include_free_services'),
  'true', 'T10 include_free_services defaults to true');
select is(
  (select pr.is_listed or pr.free_for_all from public.provider_regions pr
   where pr.provider_id = 9102 and pr.country = 'FR'),
  false, 'T10 is_listed and free_for_all default to false');
select tests.create_title('Test Film Defaults');
select is(
  (select t.tmdb_missing_since is null from public.titles t where t.id = tests.title_id('Test Film Defaults')),
  true, 'T10 tmdb_missing_since defaults to null');
insert into public.title_certifications (title_id, country, certification)
values (tests.title_id('Test Film Defaults'), 'FR', 'U');
select is(
  (select c.inferred_from is null from public.title_certifications c
   where c.title_id = tests.title_id('Test Film Defaults')),
  true, 'T10 inferred_from defaults to null');
select lives_ok(
  $$update public.title_certifications set inferred_from = 'US' where certification = 'U'
    and title_id = tests.title_id('Test Film Defaults')$$,
  'T10 inferred_from accepts a country code');
select throws_ok(
  $$update public.title_certifications set inferred_from = 'fr' where certification = 'U'
    and title_id = tests.title_id('Test Film Defaults')$$,
  '23514', null, 'T10 inferred_from refuses lower case');

-- Q22: a cleared film keeps no original title.
select lives_ok(
  $$update public.titles set original_title = null where id = tests.title_id('Test Film Defaults')$$,
  'T13 titles.original_title can be cleared');

-- T11: grants on countries.
select tests.act_as_server();
select lives_ok($$insert into public.countries (code, default_language, catalog_enabled) values ('ZZ', 'en', true)$$,
  'T11 app_server can insert a country');
select lives_ok($$update public.countries set catalog_enabled = false where code = 'ZZ'$$,
  'T11 app_server can update a country');
select tests.clear_authentication();
select tests.authenticate_as('p1');
select throws_ok($$insert into public.countries (code) values ('YY')$$,
  '42501', null, 'T11 a phone cannot insert a country');
select throws_ok($$update public.countries set catalog_enabled = false where code = 'FR'$$,
  '42501', null, 'T11 a phone cannot update a country');
select tests.clear_authentication();

-- The comment on refresh_tier carries the new meaning.
select matches(
  (select col_description('public.titles'::regclass,
     (select attnum from pg_attribute where attrelid = 'public.titles'::regclass and attname = 'refresh_tier'))),
  'enabled country', 'T14 the refresh_tier comment states the new meaning');

select * from finish();
rollback;

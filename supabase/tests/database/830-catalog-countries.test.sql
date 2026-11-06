-- M11.11: api.catalog_countries lists the countries that have a catalog, for the country choice
-- in Settings and in "Not in your country yet". Players can read it and cannot write countries.
-- A chosen country is saved by api.update_profile and is what Play alone and Host use.

begin;
select plan(7);

select tests.create_player('chooser');

insert into public.countries (code, default_language, catalog_enabled) values
  ('DE', 'de', false), ('BE', 'fr', true)
on conflict (code) do update set catalog_enabled = excluded.catalog_enabled;

select tests.authenticate_as('chooser');

select results_eq(
  $$select code::text from api.catalog_countries order by code$$,
  $$values ('BE'), ('FR')$$,
  'T1 api.catalog_countries lists the countries with a catalog and no other');

select is((select count(*)::integer from api.catalog_countries where code = 'DE'), 0,
  'T2 a country without a catalog is not listed');

select throws_ok($$update public.countries set catalog_enabled = true where code = 'DE'$$, '42501', null,
  'T3 a player cannot change countries');

select is((select api.update_profile(p_country => 'BE')->>'status'), 'ok',
  'T4 api.update_profile saves a chosen country');
select is((select country::text from api.my_profile), 'BE', 'T5 the profile reads the chosen country');

-- T6/T7: the server rules take the chosen country, not the phone's region.
select api.update_profile('Sam');
select is((select api.create_room()->>'status'), 'ok', 'T6 a host with a chosen country opens a room');
select is((select r.country::text from public.rooms r
           where r.host_id = internal.my_profile_id() order by r.created_at desc limit 1), 'BE',
  'T7 the room takes the chosen country');

select * from finish();
rollback;

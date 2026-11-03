-- M3.10: the minimum app version the baseline seeded (1.0.0) would have blocked the
-- 0.1.0 builds that exist today, so a data migration sets it to 0.0.0 on both platforms
-- (decisions.md). Harry raises it by hand when a build must retire.

begin;
select plan(4);

select tests.create_player('guest1');
select tests.authenticate_as('guest1');

select is(
  (select value from api.app_config where key = 'min_app_version'),
  '{"ios": "0.0.0", "android": "0.0.0"}'::jsonb,
  'T1 a guest reads min_app_version, 0.0.0 on ios and android');
select is(
  (select count(*) from api.app_config where key = 'min_app_version'), 1::bigint,
  'T2 min_app_version is one row');

-- 0.1.0 is today's build: it must pass a numeric major.minor.patch comparison.
select ok(
  (select string_to_array(value->>'ios', '.')::int[] <= string_to_array('0.1.0', '.')::int[]
   from api.app_config where key = 'min_app_version'),
  'T3 the ios minimum does not block 0.1.0');
select ok(
  (select string_to_array(value->>'android', '.')::int[] <= string_to_array('0.1.0', '.')::int[]
   from api.app_config where key = 'min_app_version'),
  'T3 the android minimum does not block 0.1.0');

select * from finish();
rollback;

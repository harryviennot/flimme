-- M2.11: the catalog's six scheduled jobs, in Supabase Cron (tmdb.md#keeping-it-fresh,
-- "Schedules live in the database"). Each job only queues a `job` message on
-- catalog_refresh; the pipeline worker runs it. Times are UTC, which is what pg_cron uses
-- (decisions Q21). cron.schedule with a name replaces a job of that name, so this file
-- is safe to run twice. Adds no table and no function, so no grants and no typegen.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Sunday 01:00.
select cron.schedule(
  'catalog_reference_weekly', '0 1 * * 0',
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"reference_weekly"}')$$);

-- 02:00 UTC is 03:00 Paris in winter and 04:00 in summer.
select cron.schedule(
  'catalog_availability_sweep', '0 2 * * *',
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"availability_sweep"}')$$);

select cron.schedule(
  'catalog_changes_daily', '0 5 * * *',
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"changes_daily"}')$$);

-- After TMDB's export file is ready (08:00 UTC).
select cron.schedule(
  'catalog_popularity_daily', '30 8 * * *',
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"popularity_daily"}')$$);

-- Monday 03:00: tier 1 films.
select cron.schedule(
  'catalog_details_weekly', '0 3 * * 1',
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"details_weekly"}')$$);

-- The 1st at 04:00: tier 2 and inactive films.
select cron.schedule(
  'catalog_details_monthly', '0 4 1 * *',
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"details_monthly"}')$$);

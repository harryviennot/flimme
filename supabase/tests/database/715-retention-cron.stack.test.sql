-- M8.9: the retention job lives in Supabase Cron (operations.md#retention-jobs). Real stack only:
-- the lite database records cron jobs but never runs them. The function itself is tested in
-- 710-retention.test.sql.

begin;
select plan(3);

select is((select count(*) from cron.job where jobname = 'retention_daily'), 1::bigint, 'the retention_daily job exists');
select is((select schedule from cron.job where jobname = 'retention_daily'), '30 4 * * *', 'it runs at 04:30 UTC');
select is((select command from cron.job where jobname = 'retention_daily'), 'select internal.run_retention()',
          'and calls the function');

select * from finish();
rollback;

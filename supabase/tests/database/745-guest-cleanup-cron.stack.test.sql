-- M8.8: the guest cleanup lives in Supabase Cron (operations.md#retention-jobs). Real stack only.
-- The function itself is tested in 740-guest-cleanup.test.sql.

begin;
select plan(3);

select is((select count(*) from cron.job where jobname = 'guest_cleanup_daily'), 1::bigint, 'the guest_cleanup_daily job exists');
select is((select schedule from cron.job where jobname = 'guest_cleanup_daily'), '45 4 * * *', 'it runs at 04:45 UTC');
select is((select command from cron.job where jobname = 'guest_cleanup_daily'), 'select internal.delete_inactive_guests()',
          'and calls the function');

select * from finish();
rollback;

-- M2.11: the six catalog jobs live in Supabase Cron (tmdb.md#keeping-it-fresh, "Schedules
-- live in the database"). Each one only queues a `job` message on catalog_refresh; the
-- pipeline worker does the work (tests/contract/test_refresh_job.py in server/).
--
-- Cron never runs in a test: the command of each job is run by hand, which is what the
-- scheduler does. Times are UTC (decisions Q21).

begin;
select plan(9);

select is(
  (select count(*) from cron.job where jobname like 'catalog\_%'),
  6::bigint,
  'the six catalog jobs exist');

select results_eq(
  $$ select jobname, schedule from cron.job where jobname like 'catalog\_%' order by jobname $$,
  $$ values
    ('catalog_availability_sweep'::text, '0 2 * * *'::text),
    ('catalog_changes_daily', '0 5 * * *'),
    ('catalog_details_monthly', '0 4 1 * *'),
    ('catalog_details_weekly', '0 3 * * 1'),
    ('catalog_popularity_daily', '30 8 * * *'),
    ('catalog_reference_weekly', '0 1 * * 0') $$,
  'each job has its schedule, in UTC');

-- Anything already queued (a seed, another test on the shared stack) is none of ours.
create temp table before_run as select count(*) as n from tests.queued('catalog_refresh');

do $$
declare
  v_command text;
begin
  for v_command in select command from cron.job where jobname like 'catalog\_%' order by jobname loop
    execute v_command;
  end loop;
end
$$;

select is(
  (select count(*) from tests.queued('catalog_refresh')) - (select n from before_run),
  6::bigint,
  'running the six commands queues six messages');

select is(
  (select array_agg(m->>'job' order by m->>'job')
   from (select q as m from tests.queued('catalog_refresh') q offset (select n from before_run)) x
   where m->>'kind' = 'job'),
  array['availability_sweep', 'changes_daily', 'details_monthly', 'details_weekly',
        'popularity_daily', 'reference_weekly'],
  'one job message per kind, each with the job name of the pipeline');

select is(
  (select count(*)
   from (select q as m from tests.queued('catalog_refresh') q offset (select n from before_run)) x
   where (m - 'kind' - 'job') <> '{}'),
  0::bigint,
  'a job message carries a kind and a job and nothing else');

select is(
  (select command from cron.job where jobname = 'catalog_changes_daily'),
  $$select internal.enqueue('catalog_refresh', '{"kind":"job","job":"changes_daily"}')$$,
  'a command is a call to internal.enqueue and nothing else');

select is(
  (select count(*) from cron.job where jobname like 'catalog\_%' and not active),
  0::bigint,
  'no catalog job is switched off');

-- The names are the ones in the job table of tmdb.md, so a second run of the migration
-- (cron.schedule by name) replaces a job instead of adding one.
select is(
  (select count(*) from (select jobname from cron.job group by jobname having count(*) > 1) d),
  0::bigint,
  'job names are unique');

select is(
  (select count(*) from cron.job where jobname like 'catalog\_%'
     and command not like '%internal.enqueue(''catalog_refresh'', ''{"kind":"job","job":"%"}'')'),
  0::bigint,
  'every command queues on catalog_refresh');

select * from finish();
rollback;

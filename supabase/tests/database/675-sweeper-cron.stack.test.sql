-- M6.6: the sweeper's cron job (game-modes.md#internalsweep_rooms). Real stack only: the lite
-- database records cron jobs but never runs them. Cron never runs in a test; the command is run
-- by hand. The procedure (which commits) and a room another session holds locked are tested in
-- server/tests/contract/test_sweep_rooms.py; this file checks the job and the procedure exist.

begin;
select plan(4);

select is((select count(*) from cron.job where jobname = 'sweep_rooms'), 1::bigint, 'the sweep_rooms job exists');
select is((select schedule from cron.job where jobname = 'sweep_rooms'), '* * * * *', 'it runs every minute');
select is((select command from cron.job where jobname = 'sweep_rooms'), 'call internal.sweep_rooms()',
          'and calls the procedure');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'internal' and p.proname = 'sweep_rooms' and p.prokind = 'p'),
          1::bigint, 'sweep_rooms is a procedure');

select * from finish();
rollback;

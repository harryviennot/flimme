-- M9.5: the signals that read the real pgmq and pg_cron (operations.md#monitoring-and-alerts).
-- Real stack only: the lite database has stand-ins that never run cron.

begin;
select plan(5);

create function pg_temp.crossed(p_name text) returns boolean language sql as $$
  select (s->>'crossed')::boolean from jsonb_array_elements(internal.ops_health()->'signals') s where s->>'name' = p_name
$$;

delete from cron.job_run_details;
select ok(not pg_temp.crossed('sweep_rooms_missed'), '8 no runs at all: sweep_rooms_missed is quiet');

-- A message 20 minutes old on room_finished.
select pgmq.send('room_finished', '{"kind": "test"}'::jsonb);
update pgmq.q_room_finished set enqueued_at = now() - interval '20 minutes';
select ok(pg_temp.crossed('queue_age:room_finished'), '8 a 20 minute old room_finished message crosses queue_age:room_finished');

-- Three failed sweep_rooms runs in a row.
insert into cron.job_run_details (jobid, runid, database, username, command, status, start_time, end_time)
select j.jobid, 900000000 + n, current_database(), current_user, j.command, 'failed',
       now() - n * interval '1 minute', now() - n * interval '1 minute' + interval '1 second'
from cron.job j, generate_series(0, 2) n where j.jobname = 'sweep_rooms';
select ok(pg_temp.crossed('sweep_rooms_missed'), '8 three failed sweep_rooms runs cross sweep_rooms_missed');

-- Runs that succeeded, but none in the last 3 minutes.
delete from cron.job_run_details;
insert into cron.job_run_details (jobid, runid, database, username, command, status, start_time, end_time)
select j.jobid, 900000100 + n, current_database(), current_user, j.command, 'succeeded',
       now() - interval '10 minutes' - n * interval '1 minute', now() - interval '10 minutes' - n * interval '1 minute'
from cron.job j, generate_series(0, 2) n where j.jobname = 'sweep_rooms';
select ok(pg_temp.crossed('sweep_rooms_missed'), '8 no run started in the last 3 minutes crosses it too');

-- A recent success with older failures does not.
insert into cron.job_run_details (jobid, runid, database, username, command, status, start_time, end_time)
select j.jobid, 900000200, current_database(), current_user, j.command, 'succeeded', now() - interval '20 seconds', now()
from cron.job j where j.jobname = 'sweep_rooms';
select ok(not pg_temp.crossed('sweep_rooms_missed'), '8 a run in the last minute clears it');

select * from finish();
rollback;

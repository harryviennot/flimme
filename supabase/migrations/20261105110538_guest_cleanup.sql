-- M8.8: the daily guest cleanup (security.md#guest-accounts, operations.md#retention-jobs,
-- decisions.md #194). Supabase has no automatic cleanup of anonymous users, so the database
-- deletes them from auth.users itself. The delete cascades to the profile and everything personal;
-- seats stay in past rooms, anonymous, through internal.scrub_deleted_profile.
-- The ingest_runs kind 'guest_cleanup' was added by M8.9.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- A guest is an anonymous account whose latest sign of life is over 90 days old: the account's
-- and profile's created_at, the profile's last_seen_at, and any of its seats' last_active_at.
-- A guest hosting a room still in play is skipped. At most p_limit guests a run (the argument
-- is for tests; cron passes none); "capped" says more wait for the next night. Only counts are
-- returned or recorded, never an id. A failure raises, so the cron run shows as failed.
create function internal.delete_inactive_guests(p_limit integer default 1000) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '10s'
set statement_timeout = '10min'
as $$
declare
  v_run_id bigint;
  v_deleted bigint;
  v_capped boolean;
  v_stats jsonb;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'delete_inactive_guests: the limit must be at least 1';
  end if;

  insert into public.ingest_runs (kind) values ('guest_cleanup') returning id into v_run_id;

  with doomed as (
    select u.id
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
    where u.is_anonymous
      and greatest(
            u.created_at,
            p.created_at,
            p.last_seen_at,
            (select max(m.last_active_at) from public.room_members m where m.profile_id = p.id)
          ) < now() - interval '90 days'
      and not exists (select 1 from public.rooms r
                      where r.host_id = p.id and r.state not in ('done', 'abandoned'))
    order by u.id limit p_limit + 1),
  gone as (
    delete from auth.users where id in (select id from doomed order by id limit p_limit) returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_limit into v_deleted, v_capped;

  v_stats := jsonb_build_object('deleted', v_deleted, 'capped', v_capped);
  update public.ingest_runs set finished_at = now(), stats = v_stats where id = v_run_id;
  return v_stats || jsonb_build_object('run_id', v_run_id);
end
$$;

-- Cron (postgres) only.
revoke all on function internal.delete_inactive_guests(integer) from public, anon, authenticated;

-- 04:45 UTC, after the 04:30 retention job. cron.schedule with a name replaces a job of that
-- name, so this file is safe to run twice.
select cron.schedule('guest_cleanup_daily', '45 4 * * *', $$select internal.delete_inactive_guests()$$);

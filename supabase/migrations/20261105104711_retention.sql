-- M8.9: the daily retention job (operations.md#retention-jobs, data-model.md#retention).
-- One function deletes what the rules no longer keep and records what it deleted in an
-- ingest_runs row (kind 'retention'); Supabase Cron runs it at 04:30 UTC.
--
-- Deferred (decisions, 4 Nov 2026 night): rec.request_items at 90 days waits for the trainer's
-- monthly export (M22.1); card_history at 12 months comes with the deck engine task that creates
-- its table. Guest accounts are M8.8; TMDB content is the pipeline worker's monthly job.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- M8.9 adds 'retention'; M8.8 will use 'guest_cleanup' (one replacement, not two).
-- squawk-ignore ban-drop-constraint, prefer-robust-stmts
alter table public.ingest_runs drop constraint ingest_runs_kind_check;
alter table public.ingest_runs
  add constraint ingest_runs_kind_check check (kind in (
    'backfill', 'availability_sweep', 'popularity_daily', 'changes_daily',
    'details_weekly', 'details_monthly', 'reference_weekly', 'embeddings', 'moods',
    'retention', 'guest_cleanup'
  )) not valid;
alter table public.ingest_runs validate constraint ingest_runs_kind_check;

-- Each rule takes at most p_cap rows a night (the argument is for tests; cron passes none).
-- "capped" says rows remain for the next night. "After the room ends" is
-- coalesce(ended_at, expires_at) of a room in done or abandoned: a room in play is never touched,
-- so no game holds a lock on what is deleted here. A rule that errors raises, the whole run rolls
-- back and the cron run shows as failed in cron.job_run_details (M9.5 alerts on a missing run).
create function internal.run_retention(p_cap integer default 50000) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '10s'
set statement_timeout = '10min'
as $$
declare
  v_run_id bigint;
  v_stats jsonb := '{}';
  v_deleted bigint;
  v_capped boolean;
begin
  if p_cap is null or p_cap < 1 then
    raise exception 'run_retention: the cap must be at least 1';
  end if;

  insert into public.ingest_runs (kind) values ('retention') returning id into v_run_id;

  -- Lobbies that never started: abandoned, 7 days after they ended, and with no report under 12
  -- months old. Seats and cards cascade.
  with doomed as (
    select r.id from public.rooms r
    where r.state = 'abandoned' and r.started_at is null
      and coalesce(r.ended_at, r.expires_at) < now() - interval '7 days'
      -- A report is a safety record kept 12 months (data-model.md#retention) and would cascade
      -- with its room: the room waits until the report rule has deleted its reports.
      and not exists (select 1 from public.member_reports mr
                      where mr.room_id = r.id and mr.created_at >= now() - interval '12 months')
    order by r.id limit p_cap + 1),
  gone as (
    delete from public.rooms where id in (select id from doomed order by id limit p_cap) returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('lobbies', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- Deck entries: 1 day after the room ends.
  with doomed as (
    select d.room_member_id, d.title_id from public.deck_entries d
    join public.rooms r on r.id = d.room_id
    where r.state in ('done', 'abandoned') and coalesce(r.ended_at, r.expires_at) < now() - interval '1 day'
    order by d.room_member_id, d.title_id limit p_cap + 1),
  gone as (
    delete from public.deck_entries d
    where (d.room_member_id, d.title_id) in (select room_member_id, title_id from doomed order by room_member_id, title_id limit p_cap)
    returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('deck_entries', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- Room cards nobody voted on, 7 days after the room ends. A pick (matches) and a finale
  -- candidate (round_candidates) keep their card, so a finished room still shows its result.
  with doomed as (
    select c.room_id, c.title_id from public.room_cards c
    join public.rooms r on r.id = c.room_id
    where r.state in ('done', 'abandoned') and coalesce(r.ended_at, r.expires_at) < now() - interval '7 days'
      and not exists (select 1 from public.votes v where v.room_id = c.room_id and v.title_id = c.title_id)
      and not exists (select 1 from public.matches m where m.room_id = c.room_id and m.title_id = c.title_id)
      and not exists (select 1 from public.round_candidates rc
                      join public.rounds ro on ro.id = rc.round_id
                      where ro.room_id = c.room_id and rc.title_id = c.title_id)
    order by c.room_id, c.title_id limit p_cap + 1),
  gone as (
    delete from public.room_cards c
    where (c.room_id, c.title_id) in (select room_id, title_id from doomed order by room_id, title_id limit p_cap)
    returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('room_cards', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- swipe_log: 13 months.
  with doomed as (
    select id from public.swipe_log where created_at < now() - interval '13 months' order by id limit p_cap + 1),
  gone as (
    delete from public.swipe_log where id in (select id from doomed order by id limit p_cap) returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('swipe_log', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- rec.requests: 13 months. Items cascade; deck_entries.request_id is set to null.
  with doomed as (
    select id from rec.requests where created_at < now() - interval '13 months' order by id limit p_cap + 1),
  gone as (
    delete from rec.requests where id in (select id from doomed order by id limit p_cap) returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('rec_requests', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- import_rows unmatched: 30 days after the import finished (started, if it never did).
  with doomed as (
    select r.id from public.import_rows r
    join public.imports i on i.id = r.import_id
    where r.status = 'unmatched' and coalesce(i.finished_at, i.started_at) < now() - interval '30 days'
    order by r.id limit p_cap + 1),
  gone as (
    delete from public.import_rows where id in (select id from doomed order by id limit p_cap) returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('import_rows', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- rate_limits: 1 day.
  with doomed as (
    select key, window_start from public.rate_limits where window_start < now() - interval '1 day'
    order by key, window_start limit p_cap + 1),
  gone as (
    delete from public.rate_limits l
    where (l.key, l.window_start) in (select key, window_start from doomed order by key, window_start limit p_cap)
    returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('rate_limits', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  -- member_reports: 12 months.
  with doomed as (
    select id from public.member_reports where created_at < now() - interval '12 months' order by id limit p_cap + 1),
  gone as (
    delete from public.member_reports where id in (select id from doomed order by id limit p_cap) returning 1)
  select (select count(*) from gone), (select count(*) from doomed) > p_cap into v_deleted, v_capped;
  v_stats := v_stats || jsonb_build_object('member_reports', jsonb_build_object('deleted', v_deleted, 'capped', v_capped));

  update public.ingest_runs set finished_at = now(), stats = v_stats where id = v_run_id;
  return v_stats || jsonb_build_object('run_id', v_run_id);
end
$$;

-- Cron (postgres) only.
revoke all on function internal.run_retention(integer) from public, anon, authenticated;

-- 04:30 UTC, after the 02:00 availability sweep. cron.schedule with a name replaces a job of
-- that name, so this file is safe to run twice.
select cron.schedule('retention_daily', '30 4 * * *', $$select internal.run_retention()$$);

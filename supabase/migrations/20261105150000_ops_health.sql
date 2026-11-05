-- M9.5: internal.ops_health(), the one read the pipeline worker's health check makes every
-- 5 minutes (operations.md#monitoring-and-alerts, decisions.md #194). It answers which
-- operational thresholds exist and which are crossed; the thresholds live here, the worker only
-- sends the crossed ones to Sentry.
--
-- Read-only. {"checked_at": ts, "signals": [{"name", "value", "threshold", "crossed", "ids"?}]}.
-- A value is null where nothing exists yet (no run yet, no deals, an idle queue); a null value is
-- never crossed. `ids` is only on new_reports. Counts and ids only: no name, code or reason.
--
-- Deals dealt by the SQL engine are by design (operations.md), but a deal does not record which
-- engine dealt it, so the two deal signals are quiet while deck_engine() is 'sql' now.
-- Left out for now: sign-in 429s and database CPU (they need Supabase's API and an access token).

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function internal.ops_health() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_signals jsonb;
  v_sql_engine boolean := internal.deck_engine() = 'sql';
begin
  with
  sweep as (
    select r.status, r.start_time,
           row_number() over (order by r.start_time desc) as rn
    from cron.job_run_details r
    join cron.job j on j.jobid = r.jobid
    where j.jobname = 'sweep_rooms'
  ),
  sweep_state as (
    select count(*) as runs,
           count(*) filter (where rn <= 3 and status = 'failed') as failed_of_last_3,
           extract(epoch from now() - max(start_time)) as silent_s
    from sweep
  ),
  last_run as (
    select distinct on (kind) kind, id, started_at, finished_at, stats
    from public.ingest_runs
    where kind in ('availability_sweep', 'changes_daily', 'popularity_daily')
    order by kind, started_at desc, id desc
  ),
  catalog_age as (
    select max(greatest(
             extract(epoch from now() - l.started_at) / 3600,
             coalesce((select extract(epoch from now() - min(u.started_at)) / 3600
                       from public.ingest_runs u
                       where u.kind = l.kind and u.finished_at is null), 0))) as hours
    from last_run l
  ),
  agreement as (
    select (stats->>'agreement_percent')::numeric as pct
    from public.ingest_runs
    where stats ? 'agreement_percent'
    order by started_at desc, id desc limit 1
  ),
  tmdb as (
    select sum((stats->>'requests')::numeric) as requests,
           sum(coalesce((stats->>'rate_limited')::numeric, 0)) as limited
    from public.ingest_runs
    where started_at > now() - interval '24 hours' and stats ? 'requests'
  ),
  deals as (
    select count(*) as total,
           count(*) filter (where is_fallback) as fallbacks
    from rec.requests where created_at > now() - interval '1 hour'
  ),
  latency as (
    select percentile_cont(0.95) within group (order by latency_ms) as p95
    from rec.requests
    where created_at > now() - interval '15 minutes' and not is_fallback and latency_ms is not null
  ),
  unalerted as (
    select count(*) as n, (array_agg(id order by created_at, id))[1:100] as ids
    from public.member_reports where alerted_at is null
  ),
  retention as (
    select extract(epoch from now() - max(finished_at)) / 3600 as hours
    from public.ingest_runs where kind = 'retention' and finished_at is not null
  ),
  signals(name, value, threshold, ids) as (
    select 'queue_age:' || m.queue_name, m.oldest_msg_age_sec::numeric,
           case m.queue_name
             when 'deck_requests' then 10
             when 'room_finished' then 900
             when 'taste_refresh' then 900
             else 21600 end::numeric,
           null::uuid[]
    from pgmq.metrics_all() m
    union all
    -- Missed runs in a row: the last 3 all failed (3), or whole minutes of silence.
    -- Quiet before the first run ever.
    select 'sweep_rooms_missed',
           case when s.runs = 0 then null
                else greatest(case when s.runs >= 3 then s.failed_of_last_3 else 0 end,
                              floor(s.silent_s / 60))::numeric end,
           2, null from sweep_state s
    union all
    select 'retention_overdue', round(r.hours, 2), 36, null from retention r
    union all
    select 'catalog_unfinished', round(c.hours, 2), 36, null from catalog_age c
    union all
    select 'sweep_guard',
           (select coalesce((stats->>'guard_trips')::numeric, 0) from last_run where kind = 'availability_sweep'),
           0, null
    union all
    select 'tmdb_429_rate',
           case when t.requests > 0 then round(100 * t.limited / t.requests, 2) end, 1, null from tmdb t
    union all
    select 'sweep_agreement', a.pct, 98, null from (select 1) x left join agreement a on true
    union all
    select 'new_reports', u.n::numeric, 0, u.ids from unalerted u
    union all
    select 'deal_latency_p95', case when v_sql_engine then null else round(l.p95::numeric, 0) end, 1000, null
    from latency l
    union all
    select 'fallback_share',
           case when v_sql_engine or d.total = 0 then null else round(100.0 * d.fallbacks / d.total, 2) end, 5, null
    from deals d
    union all
    -- Percent of the 8 GB the plan includes, and of max_connections.
    select 'db_size', round(100.0 * pg_database_size(current_database()) / 8589934592, 2), 70, null
    union all
    select 'db_connections',
           round(100.0 * (select coalesce(sum(numbackends), 0) from pg_stat_database)
                 / current_setting('max_connections')::numeric, 2), 80, null
  )
  select jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object('name', s.name, 'threshold', s.threshold, 'crossed',
                               coalesce(case when s.name = 'sweep_agreement' then s.value < s.threshold
                                                        else s.value > s.threshold end, false), 'ids', to_jsonb(s.ids)))
           || jsonb_build_object('value', s.value)
           order by s.name)
  into v_signals
  from signals s;

  return jsonb_build_object('checked_at', now(), 'signals', coalesce(v_signals, '[]'::jsonb));
end
$$;

revoke all on function internal.ops_health() from public, anon, authenticated;
grant execute on function internal.ops_health() to app_server;

-- Sets alerted_at on reports not yet alerted; returns how many it set. The worker calls it only
-- after Sentry accepted the event, so a failed send is retried by the next check.
create function internal.mark_reports_alerted(p_ids uuid[]) returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.member_reports set alerted_at = now()
  where id = any(coalesce(p_ids, '{}'::uuid[])) and alerted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function internal.mark_reports_alerted(uuid[]) from public, anon, authenticated;
grant execute on function internal.mark_reports_alerted(uuid[]) to app_server;

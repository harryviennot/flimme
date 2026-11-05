-- M9.5: internal.ops_health() and internal.mark_reports_alerted (operations.md#monitoring-and-alerts).
-- Times are moved with plain inserts. The stack-only checks (a real queue message aging, failed
-- cron runs) are in 775-ops-health.stack.test.sql.

begin;
select plan(37);

select tests.create_catalog(3);

create function pg_temp.sig(p_name text) returns jsonb language sql as $$
  select s from jsonb_array_elements(internal.ops_health()->'signals') s where s->>'name' = p_name
$$;
create function pg_temp.crossed(p_name text) returns boolean language sql as $$
  select (pg_temp.sig(p_name)->>'crossed')::boolean
$$;
create function pg_temp.run(p_kind text, p_started interval, p_finished interval, p_stats jsonb default '{}') returns void
language sql as $$
  insert into public.ingest_runs (kind, started_at, finished_at, stats)
  values (p_kind, now() - p_started, case when p_finished is not null then now() - p_finished end, p_stats)
$$;

-- Nothing in the tables ----------------------------------------------------------------
delete from public.ingest_runs;
delete from public.member_reports;
delete from rec.requests;
select tests.use_deck_engine('server');

select is((select count(*) from jsonb_array_elements(internal.ops_health()->'signals') s where (s->>'crossed')::boolean),
  0::bigint, '1 with no rows, no signal is crossed');
select ok((select bool_and(s ? 'name' and s ? 'threshold' and s ? 'crossed' and s ? 'value')
           from jsonb_array_elements(internal.ops_health()->'signals') s),
  '1 every signal carries name, value, threshold and crossed');
select is((select array_agg(n order by n) from (
    select s->>'name' n from jsonb_array_elements(internal.ops_health()->'signals') s
    where s->>'name' !~ '^queue_age:') x),
  array['catalog_unfinished', 'db_connections', 'db_size', 'deal_latency_p95', 'fallback_share',
        'new_reports', 'retention_overdue', 'sweep_agreement', 'sweep_guard', 'sweep_rooms_missed',
        'tmdb_429_rate'],
  '1 every signal is present with no rows');
select ok(internal.ops_health() ? 'checked_at', '1 the answer says when it was checked');
select ok(pg_temp.sig('retention_overdue')->'value' = 'null'::jsonb, '1 retention_overdue has a null value before any run');
select is((select count(*) from jsonb_array_elements(internal.ops_health()->'signals') s where s->>'name' like 'queue_age:%'),
  (select count(*) from pgmq.metrics_all()), '1 every queue has a queue_age signal');
select is(pg_temp.sig('queue_age:deck_requests')->>'threshold', '10', '3 deck_requests: 10 seconds');
select is(pg_temp.sig('queue_age:room_finished')->>'threshold', '900', '3 room_finished: 15 minutes');
select is(pg_temp.sig('queue_age:taste_refresh')->>'threshold', '900', '3 taste_refresh: 15 minutes');
select is(pg_temp.sig('queue_age:catalog_refresh')->>'threshold', '21600', '3 the other queues: 6 hours');

-- Reports ------------------------------------------------------------------------------
select tests.create_room(2);
insert into public.member_reports (room_id, reporter_member_id, reported_member_id, reason)
values (tests.room_id(), tests.member_id('p1'), tests.member_id('p2'), 'spam');

select ok(pg_temp.crossed('new_reports'), '2 an unalerted report crosses new_reports');
select is(pg_temp.sig('new_reports')->'ids', jsonb_build_array((select id::text from public.member_reports)),
  '2 and carries its id');
select is((select count(*) from jsonb_array_elements(internal.ops_health()->'signals') s
           where s ? 'ids' and s->>'name' <> 'new_reports'), 0::bigint, '2 ids appear on new_reports only');
select ok(internal.ops_health()::text !~* 'spam|offensive', '2 the answer holds no reason');

create temp table report_ids as select id from public.member_reports;
grant select on report_ids to app_server;
select tests.act_as_server();
select is(internal.mark_reports_alerted(array(select id from report_ids)), 1, '2 marking returns the count');
select is(internal.mark_reports_alerted(array(select id from report_ids)), 0, '2 marking twice returns 0');
select tests.clear_authentication();
select ok(not pg_temp.crossed('new_reports'), '2 after marking, new_reports is not crossed');
select isnt((select alerted_at from public.member_reports), null, '2 alerted_at is set');
select is(internal.mark_reports_alerted(null), 0, '2 no ids marks nothing');

-- Retention ----------------------------------------------------------------------------
select pg_temp.run('retention', interval '38 hours', interval '37 hours');
select ok(pg_temp.crossed('retention_overdue'), '3 a retention run finished 37 hours ago crosses retention_overdue');
select pg_temp.run('retention', interval '36 hours', interval '35 hours');
select ok(not pg_temp.crossed('retention_overdue'), '3 one finished 35 hours ago does not');

-- Catalog runs -------------------------------------------------------------------------
select pg_temp.run('availability_sweep', interval '1 hour', interval '30 minutes', '{"guard_trips": 1}');
select ok(pg_temp.crossed('sweep_guard'), '4 a sweep with guard_trips 1 crosses sweep_guard');
select pg_temp.run('availability_sweep', interval '30 minutes', interval '20 minutes', '{"guard_trips": 0}');
select ok(not pg_temp.crossed('sweep_guard'), '4 the latest sweep decides: a clean one clears it');

select pg_temp.run('changes_daily', interval '10 minutes', interval '5 minutes', '{"agreement_percent": 97.5}');
select ok(pg_temp.crossed('sweep_agreement'), '4 agreement 97.5 crosses sweep_agreement');
select pg_temp.run('changes_daily', interval '4 minutes', interval '3 minutes', '{"agreement_percent": 99}');
select ok(not pg_temp.crossed('sweep_agreement'), '4 agreement 99 does not');

select pg_temp.run('details_weekly', interval '2 hours', interval '1 hour', '{"requests": 1000, "rate_limited": 20}');
select ok(pg_temp.crossed('tmdb_429_rate'), '4 429s at 2% of requests cross tmdb_429_rate');
select is((pg_temp.sig('tmdb_429_rate')->>'value')::numeric, 2::numeric, '4 and say 2 percent');

select ok(not pg_temp.crossed('catalog_unfinished'), '5 recent runs do not cross catalog_unfinished');
select pg_temp.run('popularity_daily', interval '37 hours', null);
select ok(pg_temp.crossed('catalog_unfinished'), '5 a catalog run started 37 hours ago and unfinished crosses it');

-- Deals: the SQL engine is by design, so it never alerts ---------------------------------
select tests.use_deck_engine('sql');
insert into rec.requests (room_id, kind, model_version, latency_ms, is_fallback)
select tests.room_id(), 'start', 'sql-baseline', 5, true from generate_series(1, 5);
select ok(not pg_temp.crossed('fallback_share'), '6 deals dealt by the SQL engine do not cross fallback_share');
select ok(not pg_temp.crossed('deal_latency_p95'), '6 and no latency crossing');

select tests.use_deck_engine('server');
select ok(pg_temp.crossed('fallback_share'), '6 the same fallbacks under the server engine cross it');
select is((pg_temp.sig('fallback_share')->>'value')::numeric, 100::numeric, '6 100 percent of the hour''s deals');
insert into rec.requests (room_id, kind, model_version, latency_ms, is_fallback)
select tests.room_id(), 'refill', 'ranker', 2500, false from generate_series(1, 5);
select ok(pg_temp.crossed('deal_latency_p95'), '6 server deals with a p95 of 2500 ms cross deal_latency_p95');

-- Access -------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'internal.ops_health()', 'execute')
      and not has_function_privilege('anon', 'internal.ops_health()', 'execute')
      and not has_function_privilege('app_http', 'internal.ops_health()', 'execute'),
  '7 authenticated, anon and app_http cannot run ops_health');
select ok(not has_function_privilege('authenticated', 'internal.mark_reports_alerted(uuid[])', 'execute')
      and not has_function_privilege('anon', 'internal.mark_reports_alerted(uuid[])', 'execute')
      and not has_function_privilege('app_http', 'internal.mark_reports_alerted(uuid[])', 'execute'),
  '7 nor mark_reports_alerted');
select ok(has_function_privilege('app_server', 'internal.ops_health()', 'execute')
      and has_function_privilege('app_server', 'internal.mark_reports_alerted(uuid[])', 'execute'),
  '7 the server can run both');

select * from finish();
rollback;

-- The last changes_daily run that read the feed to the end (its stats carry changes_days). A
-- run that failed has none, so the next one catches up from the one before.
select max(finished_at) from public.ingest_runs
where kind = 'changes_daily' and finished_at is not null and stats ? 'changes_days'

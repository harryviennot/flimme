-- How the reference step of a backfill ended: it ends with a row even when it fails.
select errors, note from public.ingest_runs
where kind = 'reference_weekly' and finished_at is not null
order by id desc limit 1

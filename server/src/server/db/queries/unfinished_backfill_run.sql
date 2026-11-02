-- The backfill to resume: the latest one that never finished. Its cursor holds the position.
select id, cursor from public.ingest_runs
where kind = 'backfill' and finished_at is null
order by id desc limit 1

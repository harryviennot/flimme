update public.ingest_runs
set finished_at = now(), errors = %s, note = %s, stats = %s
where id = %s

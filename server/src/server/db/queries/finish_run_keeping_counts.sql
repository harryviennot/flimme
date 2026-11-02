-- Ends a run whose counts were added as it went (count_run): errors stay, stats are merged.
update public.ingest_runs
set finished_at = now(), note = %s, cursor = %s, stats = stats || %s
where id = %s

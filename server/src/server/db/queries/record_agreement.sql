-- The per-film answer against the sweep, as a share (tmdb.md#the-daily-sweep, reconciliation).
-- Under 98 percent M9.5 alerts; nothing switches by itself (decision Q23).
update public.ingest_runs
set stats = stats || jsonb_build_object('agreement_percent', %s::numeric)
where id = %s and not stats ? 'agreement_percent'

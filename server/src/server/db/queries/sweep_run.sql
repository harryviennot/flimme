-- The run a sweep step belongs to: when it started (offers not seen since are stale). No row
-- means the message is bad input.
select started_at from public.ingest_runs where id = %s and kind = 'availability_sweep'

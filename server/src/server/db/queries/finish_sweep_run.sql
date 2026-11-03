-- The run ends when its last step is recorded.
update public.ingest_runs
set finished_at = now(),
    note = 'swept ' || (cursor ->> 'steps') || ' services'
where id = %s and finished_at is null
  and jsonb_array_length(coalesce(cursor -> 'done', '[]'::jsonb)) >= (cursor ->> 'steps')::int

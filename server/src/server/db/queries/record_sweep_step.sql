-- Add one finished step to its run, once: a step that comes back after it was recorded changes
-- nothing. The counts are added to `stats` the way count_run does.
update public.ingest_runs r
set titles_touched = r.titles_touched + %(touched)s,
    errors = r.errors + %(errors)s,
    stats = r.stats || coalesce((
      select jsonb_object_agg(d.key, coalesce((r.stats ->> d.key)::bigint, 0) + d.value::bigint)
      from jsonb_each_text(%(counts)s::jsonb) d
    ), '{}'::jsonb),
    cursor = jsonb_set(
      coalesce(r.cursor, '{}'::jsonb), '{done}',
      coalesce(r.cursor -> 'done', '[]'::jsonb) || to_jsonb(%(step)s::text)
    )
where r.id = %(run_id)s and not (coalesce(r.cursor -> 'done', '[]'::jsonb) ? %(step)s)

-- Add to a run's counts. One statement, so concurrent messages of the same run don't race.
update public.ingest_runs r
set titles_touched = r.titles_touched + %s,
    errors = r.errors + %s,
    stats = r.stats || coalesce((
      select jsonb_object_agg(d.key, coalesce((r.stats ->> d.key)::bigint, 0) + d.value::bigint)
      from jsonb_each_text(%s::jsonb) d
    ), '{}'::jsonb)
where r.id = %s

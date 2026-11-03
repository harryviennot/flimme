-- Weekly runs whose agreement share is not recorded yet. The fetches of a run count into it
-- after the job ended, so a run is read only once its fetches have had time to finish.
select id, coalesce((stats ->> 'offers_compared')::bigint, 0),
       coalesce((stats ->> 'availability_disagreements')::bigint, 0)
from public.ingest_runs
where kind = 'details_weekly' and finished_at < now() - interval '12 hours'
  and not stats ? 'agreement_percent'
  and coalesce((stats ->> 'offers_compared')::bigint, 0) > 0
order by id

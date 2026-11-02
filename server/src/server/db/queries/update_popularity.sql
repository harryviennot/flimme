-- One chunk of the popularity job. Skips a film whose popularity did not change, so the
-- run stays light and a second run the same day updates nothing.
update public.titles t
set popularity = v.popularity
from unnest(%s::int[], %s::real[]) as v(tmdb_id, popularity)
where t.media_type = 'movie' and t.tmdb_id = v.tmdb_id
  and t.popularity is distinct from v.popularity

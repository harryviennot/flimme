-- Every film the catalog holds, active or not: the popularity job updates them all, and a
-- candidate already here is never queued or fetched again for being a candidate.
select tmdb_id from public.titles where media_type = 'movie'

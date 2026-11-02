-- C in the quality score (Q18): never stored. The films being fetched are left out, so
-- running the same message again gives the same score.
select avg(vote_average)::float8 from public.titles
where is_active and not is_adult and vote_count >= 30 and tmdb_id <> all(%s::int[])

-- Tier 1 films, fetched weekly: available in an enabled country and still listed by TMDB.
-- The monthly query is the rest, so every film is in exactly one of them.
select tmdb_id from public.titles
where media_type = 'movie' and refresh_tier = 1 and is_active
order by tmdb_id

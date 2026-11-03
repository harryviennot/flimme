-- Which of these TMDB ids the catalog holds, active or not.
select tmdb_id from public.titles where media_type = 'movie' and tmdb_id = any(%s::integer[])

-- What the placeholder hook compares: the stored poster path and its placeholder (M2.8).
select poster_path, poster_placeholder from public.titles
where media_type = 'movie' and tmdb_id = %s

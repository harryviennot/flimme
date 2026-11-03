select id from public.titles where media_type = 'movie' and tmdb_id = any(%s::integer[])

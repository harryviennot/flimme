-- The placeholder of a film's poster (M2.8). Null when the film has no poster.
update public.titles set poster_placeholder = %s where media_type = 'movie' and tmdb_id = %s

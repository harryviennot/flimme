-- The floor never removes a film: one already stored is written whatever the floor says.
select 1 from public.titles where media_type = 'movie' and tmdb_id = %s

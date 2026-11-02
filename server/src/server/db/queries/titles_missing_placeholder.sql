-- Films with a poster and no placeholder, in id order, after the last one the pass saw (M2.8).
select id, tmdb_id, poster_path from public.titles
where media_type = 'movie' and poster_path is not null and poster_placeholder is null and id > %s
order by id
limit %s

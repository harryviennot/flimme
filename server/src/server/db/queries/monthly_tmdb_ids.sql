-- Everything the weekly fetch leaves out: tier 2 films and inactive ones (404 at TMDB).
-- Their monthly fetch keeps every film inside TMDB's 6-month rule.
select tmdb_id from public.titles
where media_type = 'movie' and (refresh_tier = 2 or not is_active)
order by tmdb_id

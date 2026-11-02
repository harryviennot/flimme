-- TMDB answered 404: deactivated at once, content kept (it is cleared after 6 months).
-- `tmdb_missing_since` is set once and kept while the film stays missing.
update public.titles
set is_active = false, tmdb_missing_since = coalesce(tmdb_missing_since, now())
where media_type = 'movie' and tmdb_id = %s

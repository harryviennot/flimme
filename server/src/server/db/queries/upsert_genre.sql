-- The slug is set once, on insert, so a rename in TMDB never moves what refers to it.
insert into public.genres (id, slug, names) values (%s, %s, %s)
on conflict (id) do update set names = excluded.names
where public.genres.names is distinct from excluded.names

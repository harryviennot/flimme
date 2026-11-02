insert into public.people (id, name, profile_path, popularity) values (%s, %s, %s, %s)
on conflict (id) do update
set name = excluded.name, profile_path = excluded.profile_path,
    popularity = excluded.popularity, updated_at = now()
where (public.people.name, public.people.profile_path, public.people.popularity)
  is distinct from (excluded.name, excluded.profile_path, excluded.popularity)

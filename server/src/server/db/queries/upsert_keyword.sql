insert into public.keywords (id, name) values (%s, %s)
on conflict (id) do update set name = excluded.name
where public.keywords.name is distinct from excluded.name

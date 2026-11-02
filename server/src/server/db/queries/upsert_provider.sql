-- Name and logo only: parent_id and streaming_availability_id are ours.
insert into public.providers (id, name, logo_path) values (%s, %s, %s)
on conflict (id) do update
set name = excluded.name, logo_path = excluded.logo_path, updated_at = now()
where (public.providers.name, public.providers.logo_path)
  is distinct from (excluded.name, excluded.logo_path)

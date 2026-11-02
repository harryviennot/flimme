-- The display priority only: is_listed and free_for_all are ours.
insert into public.provider_regions (provider_id, country, display_priority) values (%s, %s, %s)
on conflict (provider_id, country) do update set display_priority = excluded.display_priority
where public.provider_regions.display_priority is distinct from excluded.display_priority

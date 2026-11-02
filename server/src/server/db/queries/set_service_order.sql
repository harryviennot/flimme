update public.provider_regions set display_priority = %s
where country = %s and provider_id = %s and display_priority is distinct from %s

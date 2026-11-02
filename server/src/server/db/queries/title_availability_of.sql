select country::text, provider_id, kind::text from public.title_availability where title_id = %s

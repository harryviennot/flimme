select coalesce(min(id), 0), coalesce(max(id), -1) from public.titles

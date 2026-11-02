update public.provider_regions
set is_listed = (provider_id = any(%s::int[])), free_for_all = (provider_id = any(%s::int[]))
where country = %s
  and (is_listed, free_for_all)
    is distinct from (provider_id = any(%s::int[]), provider_id = any(%s::int[]))

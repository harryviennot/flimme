-- The swept set per country: listed or free services, and every variant of either.
with base as (
  select provider_id, country from public.provider_regions
  where country = any(%s::text[]) and (is_listed or free_for_all)
)
select country::text, provider_id from base
union
select b.country::text, p.id from base b join public.providers p on p.parent_id = b.provider_id

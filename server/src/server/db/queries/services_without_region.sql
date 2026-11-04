-- Curated ids that have no provider_regions row in this country yet.
select distinct id from unnest(%s::int[]) as t(id)
where not exists (
  select 1 from public.provider_regions pr where pr.country = %s and pr.provider_id = t.id
)
order by id

-- Curated ids that have no providers row yet.
select distinct id from unnest(%s::int[]) as t(id)
where not exists (select 1 from public.providers p where p.id = t.id)
order by id

-- A film is tier 1 when it is available (subscription, free or ads) in an enabled country, else
-- 2 (tmdb.md, "refresh_tier"). Only films whose tier is wrong are written.
with wanted as (
  select t.id,
    case when exists (
      select 1 from public.title_availability a
      join public.countries c on c.code = a.country and c.catalog_enabled
      where a.title_id = t.id
    ) then 1 else 2 end as tier
  from public.titles t
  where t.media_type = 'movie' and t.tmdb_id = any(%s::integer[])
)
update public.titles t set refresh_tier = w.tier
from wanted w
where t.id = w.id and t.refresh_tier <> w.tier

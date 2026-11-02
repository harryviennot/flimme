-- Services we curate (listed, free or a variant) in a country that TMDB no longer lists there.
select pr.provider_id
from public.provider_regions pr
join public.providers p on p.id = pr.provider_id
where pr.country = %s
  and (pr.is_listed or pr.free_for_all or p.parent_id is not null)
  and pr.provider_id <> all(%s::int[])
order by pr.provider_id

-- What a sweep step saw: new offers are added, known ones get a fresh checked_at. Films the
-- catalog does not hold have no id to point at and are left out (the caller queues them).
-- xmax is 0 on a fresh insert.
insert into public.title_availability (title_id, country, provider_id, kind, checked_at)
select t.id, %(country)s, %(provider_id)s, s.kind::public.offer_kind, now()
from unnest(%(tmdb_ids)s::integer[], %(kinds)s::text[]) as s(tmdb_id, kind)
join public.titles t on t.media_type = 'movie' and t.tmdb_id = s.tmdb_id
on conflict (title_id, country, provider_id, kind) do update set checked_at = excluded.checked_at
returning title_id, (xmax = 0) as inserted

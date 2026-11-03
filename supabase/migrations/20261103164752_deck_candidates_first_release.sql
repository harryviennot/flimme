-- M5.1: internal.deck_candidates for the first release.
--
-- The baseline version joined title_vectors, and the real catalog has none, so a
-- staging deck dealt nothing. Nobody has a taste profile yet, so every seat's fit
-- is 5 x the crowd score (deck-engine.md#scoring-a-film-for-a-player), and the
-- crowd is 0.85 x the film's quality percentile + 0.15 x its popularity
-- percentile among tonight's eligible films (no film has 50 impressions yet, so
-- the quality score stands in for the like rate).
--
-- Also new: services expand to their variants (providers.parent_id), the age cap
-- needs a certification with an age, seen films read the seated seats only, and
-- a film needs a poster. The return type changes, so the function is dropped and
-- created again (only the server's logins call it, so the ban-drop-function lint
-- does not apply); deal_baseline reads only title_id, group_score, min_fit and fits.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- squawk-ignore ban-drop-function
drop function internal.deck_candidates(uuid, integer, real);

create function internal.deck_candidates(
  p_room_id uuid,
  p_limit integer default 300,
  p_misery_line real default 1.0
) returns table (
  title_id bigint,
  group_score real,
  min_fit real,
  fits jsonb,
  watchlist_count integer,
  quality_score real,
  crowd real,
  collection_id integer
)
language sql stable security definer set search_path = ''
as $$
  with room as (
    select r.* from public.rooms r where r.id = p_room_id
  ),
  -- The room's services and their variants ("Netflix basic with ads" under Netflix).
  services as (
    select coalesce(array_agg(p.id), '{}') as ids
    from public.providers p, room r
    where p.id = any (r.provider_ids) or p.parent_id = any (r.provider_ids)
  ),
  members as (
    select m.id as member_id, m.profile_id
    from public.room_members m
    where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
  ),
  dropped as (
    select coalesce((select rm.dropped_genre_ids from public.room_models rm where rm.room_id = p_room_id), '{}') as ids
  ),
  seen_by_player as (
    select ut.title_id, ut.profile_id, max(ut.rating) as rating
    from public.user_titles ut
    where ut.seen and ut.profile_id in (select profile_id from members)
    group by ut.title_id, ut.profile_id
  ),
  seen as (
    select s.title_id, bool_and(coalesce(s.rating, 0) >= 4) as rewatchable
    from seen_by_player s group by s.title_id
  ),
  -- Rows stay narrow from here on, so the percentiles sort in work_mem.
  eligible as (
    select t.id, t.popularity, t.quality_score, t.collection_id
    from room r
    cross join services sv
    cross join dropped d
    join public.titles t on t.media_type = 'movie' and t.is_active and not t.is_adult
    left join seen s on s.title_id = t.id
    where t.poster_path is not null
      and (r.runtime_max is null or t.runtime_min <= r.runtime_max)
      and case r.quality
            when 'standard' then t.vote_count >= 150 and t.quality_score >= 6.2::real
            when 'hidden_gems' then t.vote_count between 30 and 2000 and t.quality_score >= 7.0::real
            when 'guilty_pleasures' then t.vote_count >= 150 and t.quality_score >= 4.5::real
          end
      and exists (
            select 1 from public.title_availability a
            where a.title_id = t.id and a.country = r.country
              and a.provider_id = any (sv.ids) and a.kind = any (r.offer_kinds))
      and (r.max_age is null or exists (
            select 1 from public.title_certifications c
            where c.title_id = t.id and c.country = r.country and c.min_age <= r.max_age))
      and (r.seen_rule = 'show_all' or s.title_id is null or (r.seen_rule = 'allow_rewatch' and s.rewatchable))
      and not (t.genre_ids && d.ids)
      and not exists (select 1 from public.room_cards rc where rc.room_id = p_room_id and rc.title_id = t.id)
  ),
  crowds as (
    select e.id, e.quality_score, e.collection_id,
      (0.85 * percent_rank() over (order by e.quality_score)
        + 0.15 * percent_rank() over (order by e.popularity))::real as crowd
    from eligible e
  ),
  -- Everyone's fit is the same today, so the cut is made before any per-seat work.
  top as (
    select c.id, c.quality_score, c.collection_id, c.crowd, (5 * c.crowd)::real as score
    from crowds c
    where (5 * c.crowd)::real >= p_misery_line
    order by score desc, c.id
    limit p_limit
  )
  select tp.id, tp.score, tp.score,
    coalesce((select jsonb_object_agg(m.member_id, round(tp.score::numeric, 2)) from members m), '{}'),
    (select count(distinct ut.profile_id)::int from public.user_titles ut
      where ut.title_id = tp.id and ut.on_watchlist and ut.profile_id in (select profile_id from members)),
    tp.quality_score, tp.crowd, tp.collection_id
  from top tp
  order by tp.score desc, tp.id
$$;

revoke execute on function internal.deck_candidates(uuid, integer, real) from public, anon, authenticated;
grant execute on function internal.deck_candidates(uuid, integer, real) to app_server;

-- M6.53: per-player genres on the server (game-modes.md#genres-tonight,
-- deck-engine.md#per-player-genres; decisions.md, 6 Nov 2026; tuning from the M6.52
-- simulation, simulations.md#per-player-genres).
--
-- * Each seat picks up to 3 TMDB movie genres in the lobby: never TV Movie (10770), never a
--   genre with under 30 eligible films tonight. Picks lock at Start (api.start_game copies the
--   present seats' picks into room_models.genre_picks); late joiners play the deck as it is.
-- * api.room_genres answers counts per offered genre and the caller's own picks, never who.
-- * The deal: a film's weight is the share of picking seats whose picks it matches. About 3
--   slots in 4 draw from films with a weight, by score + 0.3 x ln(weight) in the shuffle key;
--   the others follow today's order over every eligible film. A pick pool under 100 films gets
--   3 in 4 x its size / 100. With no picks the deck is exactly today's.
--
-- Replaced whole from their latest versions: internal.deck_candidates (20261105180100, its
-- eligible films move to internal.eligible_titles, unchanged; same signature and columns),
-- internal.deal_baseline
-- (20261103190017), api.set_seat_prefs (20261102193735), api.start_game (20261102220000).

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Null until Start. genre_picks: one array per seat that picked, offered genres only.
-- pick_share: the share of slots the pick pool takes, set by the first SQL deal.
alter table public.room_models
  add column if not exists genre_picks jsonb,
  add column if not exists pick_share real;

-- ---------------------------------------------------------------------------------------
-- Eligible films tonight, as internal.deck_candidates has always filtered them (the room's
-- services, country, age cap, time budget, quality preset, seen rule, dropped genres, solo
-- rules). p_include_dealt keeps the films already dealt in the room (room_genres after Start).
-- ---------------------------------------------------------------------------------------
create function internal.eligible_titles(p_room_id uuid, p_include_dealt boolean default false)
returns table (id bigint, popularity real, quality_score real, collection_id integer, genre_ids integer[])
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
  )
  select t.id, t.popularity, t.quality_score, t.collection_id, t.genre_ids
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
    and (p_include_dealt or not exists (
          select 1 from public.room_cards rc where rc.room_id = p_room_id and rc.title_id = t.id))
    -- A solo room leaves out every film the player answered, with any answer, in another solo room
    -- (an undone vote is gone, so that film may come back). Group rooms are not filtered.
    and (r.mode <> 'solo' or not exists (
          select 1 from public.votes v
          join public.room_members vm on vm.id = v.room_member_id
          join public.rooms vr on vr.id = vm.room_id
          where v.title_id = t.id and vr.mode = 'solo' and vr.id <> p_room_id
            and vm.profile_id in (select mm.profile_id from members mm)))
    -- ... and every film already in the player's My films (M6.41): liked, super liked or picked.
    and (r.mode <> 'solo' or not exists (
          select 1 from public.user_titles lu
          where lu.title_id = t.id and (lu.liked_at is not null or lu.picked_at is not null)
            and lu.profile_id in (select mm.profile_id from members mm)))
$$;

revoke execute on function internal.eligible_titles(uuid, boolean) from public, anon, authenticated;

-- The genres offered tonight: TMDB movie genres but TV Movie, with 30 eligible films or more,
-- in api.genres' order (by genre id).
create function internal.offered_genres(p_room_id uuid, p_include_dealt boolean default false)
returns table (genre_id integer, films bigint)
language sql stable security definer set search_path = ''
as $$
  select g.id, count(*)
  from internal.eligible_titles(p_room_id, p_include_dealt) e
  cross join lateral unnest(e.genre_ids) as eg(id)
  join public.genres g on g.id = eg.id
  where 'movie' = any (g.media_types) and g.id <> 10770
  group by g.id
  having count(*) >= 30
  order by g.id
$$;

revoke execute on function internal.offered_genres(uuid, boolean) from public, anon, authenticated;

-- A film's weight: the share of picking seats (p_picks, one array per seat that picked) whose
-- picks include one of the film's genres. 0 with no picks.
create function internal.pick_weight(p_genre_ids integer[], p_picks jsonb) returns real
language sql immutable set search_path = ''
as $$
  select case when count(*) = 0 then 0::real
              else (count(*) filter (where exists (
                      select 1 from jsonb_array_elements_text(p.value) g
                      where g::integer = any (p_genre_ids))))::real / count(*)::real end
  from jsonb_array_elements(case when jsonb_typeof(p_picks) = 'array' then p_picks else '[]'::jsonb end) p
  where jsonb_array_length(p.value) > 0
$$;

revoke execute on function internal.pick_weight(integer[], jsonb) from public, anon, authenticated;

-- Start locks the picks: the present seats' picks among tonight's offered genres, one array per
-- seat that picked, in seat order. Seats with no picks don't count.
create function internal.lock_genre_picks(p_room_id uuid) returns void
language sql security definer set search_path = ''
as $$
  with offered as (
    select o.genre_id from internal.offered_genres(p_room_id) o
  ),
  seats as (
    select m.id, m.joined_at,
           array(select u.g from unnest(m.genre_ids) with ordinality as u(g, o)
                 where u.g in (select genre_id from offered) order by u.o) as picks
    from public.room_members m
    where m.id = any (internal.present_member_ids(p_room_id)) and m.removed_at is null
  )
  update public.room_models rm
  set genre_picks = coalesce((
        select jsonb_agg(to_jsonb(s.picks) order by s.joined_at, s.id)
        from seats s where cardinality(s.picks) > 0), '[]'::jsonb),
      pick_share = null
  where rm.room_id = p_room_id
$$;

revoke execute on function internal.lock_genre_picks(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- internal.deck_candidates: each pool cut on its own. Today's cut (the top p_limit by score
-- above the misery line), plus the pick pool's (films with a weight, above the line, the top
-- p_limit by score + 0.3 x ln(weight)). With no picks, the rows are exactly today's. Same
-- columns: the deal reads each film's weight with internal.pick_weight.
-- ---------------------------------------------------------------------------------------
create or replace function internal.deck_candidates(
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
  with members as (
    select m.id as member_id, m.profile_id
    from public.room_members m
    where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
  ),
  picks as (
    select (select rm.genre_picks from public.room_models rm where rm.room_id = p_room_id) as p
  ),
  -- Rows stay narrow from here on, so the percentiles sort in work_mem.
  eligible as (
    select e.* from internal.eligible_titles(p_room_id) e
  ),
  crowds as (
    select e.id, e.quality_score, e.collection_id, e.genre_ids,
      (0.85 * percent_rank() over (order by e.quality_score)
        + 0.15 * percent_rank() over (order by e.popularity))::real as crowd
    from eligible e
  ),
  -- Everyone's fit is the same today, so the cut is made before any per-seat work.
  scored as (
    select c.id, c.quality_score, c.collection_id, c.crowd, (5 * c.crowd)::real as score,
           internal.pick_weight(c.genre_ids, pk.p) as w
    from crowds c cross join picks pk
    where (5 * c.crowd)::real >= p_misery_line
  ),
  open_cut as (
    select s.* from scored s order by s.score desc, s.id limit p_limit
  ),
  pick_cut as (
    select s.* from scored s where s.w > 0
    order by (s.score + 0.3 * ln(s.w))::real desc, s.id limit p_limit
  ),
  top as (
    select * from open_cut union select * from pick_cut
  )
  select tp.id, tp.score, tp.score,
    coalesce((select jsonb_object_agg(m.member_id, round(tp.score::numeric, 2)) from members m), '{}'),
    (select count(distinct ut.profile_id)::int from public.user_titles ut
      where ut.title_id = tp.id and ut.on_watchlist and ut.profile_id in (select profile_id from members)),
    tp.quality_score, tp.crowd, tp.collection_id
  from top tp
  order by tp.score desc, tp.id
$$;

-- ---------------------------------------------------------------------------------------
-- internal.deal_baseline: M5.3's version, with two lists per seat. The open list is today's
-- (the pool's films first, then the new ones, by the weighted shuffle). The pick list holds
-- the films with a weight, in the same way, by score + 0.3 x ln(weight). A seat's position n
-- (counted over its whole deck, so refills continue the pattern) is a pick slot when
-- floor(0.5 + n x share) passes a whole number: with a share of 3 in 4, slots 1, 2 and 4 of
-- every 4, 8 of the first 10. A slot takes the first film of its list not dealt yet whose
-- franchise is not among the previous 9 cards; when its list has none, the other list's.
-- ---------------------------------------------------------------------------------------
create or replace function internal.deal_baseline(p_room_id uuid, p_seat uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_temp constant double precision := 0.3;
  c_deal_size constant integer := 25;
  c_opening constant integer := 10;
  c_window constant integer := 10;     -- deck.variety.collection_window
  c_pick_share constant numeric := 0.75;  -- genres.pick_share
  c_pick_guard constant numeric := 100;   -- genres.pool_guard
  v_state public.room_state;
  v_seed integer;
  v_picks jsonb;
  v_share real;
  v_s numeric;
  v_raw jsonb;
  v_new jsonb;
  v_decks jsonb;
  v_pool jsonb;
  v_seat uuid;
  v_n integer;
  v_have integer;
  v_open jsonb;
  v_pick jsonb;
  v_list jsonb;
  v_window integer[];
  v_dealt bigint[];
  v_cards jsonb;
  v_pos integer;
  v_try integer;
  v_i integer;
  v_found jsonb;
  v_coll integer;
  v_is_pick boolean;
begin
  select state, seed into v_state, v_seed from public.rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;
  select rm.genre_picks, rm.pick_share into v_picks, v_share
  from public.room_models rm where rm.room_id = p_room_id;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v_raw from internal.deck_candidates(p_room_id, 300, 1.0) c;
  if jsonb_array_length(v_raw) < 50 then
    select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v_raw from internal.deck_candidates(p_room_id, 300, 0) c;
  end if;

  -- The pick pool's share, set once by the first deal: 3 in 4, shrunk in proportion when fewer
  -- than 100 eligible films match a pick (counted before the misery line, like the 30-film rule).
  -- No picks (or a room started before M6.53): no pick slots, and no extra scan.
  if v_share is null and not exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(v_picks) = 'array' then v_picks else '[]'::jsonb end) p
       where jsonb_array_length(p.value) > 0) then
    v_share := 0;
    update public.room_models set pick_share = 0 where room_id = p_room_id;
  end if;
  if v_share is null then
    select case when count(*) = 0 then 0
                else round(c_pick_share * least(1, count(*) / c_pick_guard), 4) end::real
    into v_share
    from internal.eligible_titles(p_room_id) e where internal.pick_weight(e.genre_ids, v_picks) > 0;
    update public.room_models set pick_share = v_share where room_id = p_room_id;
  end if;
  v_s := round(coalesce(v_share, 0)::numeric, 4);

  -- The new films in draw order, each with its odds among the films not yet drawn: k and
  -- propensity for the open list, kp and pick_propensity for the pick list.
  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', x.title_id, 'group_score', x.gs, 'min_fit', x.min_fit, 'fits', x.fits,
           'score', x.gs, 'propensity', x.share, 'k', x.k, 'collection_id', x.coll,
           'pw', x.pw, 'kp', x.kp, 'pick_propensity', x.pshare) order by x.k desc, x.title_id), '[]')
  into v_new
  from (
    select z.*,
           case when z.pw > 0 then z.wp / sum(z.wp) over (
             order by z.kp desc nulls last, z.title_id rows between current row and unbounded following) end as pshare
    from (
      select y.*, y.w / sum(y.w) over (order by y.k desc, y.title_id rows between current row and unbounded following) as share,
             case when y.pw > 0 then internal.shuffle_key(v_seed, y.title_id, y.ps) end as kp,
             case when y.pw > 0 then exp((y.ps::double precision - max(y.ps::double precision) over (partition by y.pw > 0)) / c_temp) end as wp
      from (
        select (e->>'title_id')::bigint as title_id, (e->>'group_score')::real as gs, (e->>'min_fit')::real as min_fit,
               e->'fits' as fits, (e->>'collection_id')::integer as coll,
               internal.pick_weight(t.genre_ids, v_picks) as pw,
               case when internal.pick_weight(t.genre_ids, v_picks) > 0
                 then ((e->>'group_score')::double precision
                        + c_temp * ln(internal.pick_weight(t.genre_ids, v_picks)::double precision))::real end as ps,
               internal.shuffle_key(v_seed, (e->>'title_id')::bigint, (e->>'group_score')::real) as k,
               exp(((e->>'group_score')::double precision - max((e->>'group_score')::double precision) over ()) / c_temp) as w
        from jsonb_array_elements(v_raw) e
        join public.titles t on t.id = (e->>'title_id')::bigint
      ) y
    ) z
  ) x;

  -- Each seat's cards: its pool films first, then the new ones, up to 25 unvoted, walked one
  -- position at a time (M5.3's franchise rule, Q3.1). A start has empty decks, so every seat
  -- walks the same lists and the shared opening stays identical. A refill and a late joiner
  -- count the seat's last 9 entries by sort_key, so the rule holds across the join, and its
  -- whole deck for the slot pattern. Cards a like moved up and restored votes are not checked (Q3.2).
  v_decks := '[]';
  for v_seat, v_n, v_have in
    select m.id, q.n, (select count(*)::integer from public.deck_entries d where d.room_member_id = m.id)
    from public.room_members m
    cross join lateral (
      select greatest(c_deal_size - count(*), 0)::integer as n
      from public.deck_entries d
      join public.room_cards rc on rc.room_id = d.room_id and rc.title_id = d.title_id and rc.state = 'active'
      where d.room_member_id = m.id
        and not exists (select 1 from public.votes v where v.room_member_id = m.id and v.title_id = d.title_id)
    ) q
    where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
      and (p_seat is null or m.id = p_seat)
      and q.n > 0
    order by m.joined_at, m.id
  loop
    -- The open list: today's.
    select coalesce(jsonb_agg(jsonb_build_object(
             'title_id', u.title_id, 'score', u.score, 'propensity', u.propensity, 'coll', u.coll)
           order by u.grp, u.k desc, u.title_id), '[]')
    into v_open
    from (
      select 0 as grp, p.title_id, p.gs as score, p.k, p.coll,
             p.w / sum(p.w) over (order by p.k desc, p.title_id rows between current row and unbounded following) as propensity
      from (
        select rc.title_id, rc.group_score as gs, t.collection_id as coll,
               internal.shuffle_key(v_seed, rc.title_id, rc.group_score) as k,
               exp((rc.group_score::double precision - max(rc.group_score::double precision) over ()) / c_temp) as w
        from public.room_cards rc
        join public.titles t on t.id = rc.title_id
        where rc.room_id = p_room_id and rc.state = 'active'
          and not exists (select 1 from public.deck_entries de
                          where de.room_member_id = v_seat and de.title_id = rc.title_id)
      ) p
      union all
      select 1, (e->>'title_id')::bigint, (e->>'score')::real, (e->>'k')::double precision,
             (e->>'collection_id')::integer, (e->>'propensity')::double precision
      from jsonb_array_elements(v_new) e
    ) u;

    -- The pick list: the same films with a weight, by score + 0.3 x ln(weight).
    v_pick := '[]';
    if v_s > 0 then
      select coalesce(jsonb_agg(jsonb_build_object(
               'title_id', u.title_id, 'score', u.score, 'propensity', u.propensity, 'coll', u.coll)
             order by u.grp, u.kp desc, u.title_id), '[]')
      into v_pick
      from (
        select 0 as grp, p.title_id, p.gs as score, internal.shuffle_key(v_seed, p.title_id, p.ps) as kp, p.coll,
               p.w / sum(p.w) over (order by internal.shuffle_key(v_seed, p.title_id, p.ps) desc, p.title_id
                                    rows between current row and unbounded following) as propensity
        from (
          select q.*, exp((q.ps::double precision - max(q.ps::double precision) over ()) / c_temp) as w
          from (
            select rc.title_id, rc.group_score as gs, t.collection_id as coll,
                   (rc.group_score::double precision
                     + c_temp * ln(internal.pick_weight(t.genre_ids, v_picks)::double precision))::real as ps
            from public.room_cards rc
            join public.titles t on t.id = rc.title_id
            where rc.room_id = p_room_id and rc.state = 'active'
              and internal.pick_weight(t.genre_ids, v_picks) > 0
              and not exists (select 1 from public.deck_entries de
                              where de.room_member_id = v_seat and de.title_id = rc.title_id)
          ) q
        ) p
        union all
        select 1, (e->>'title_id')::bigint, (e->>'score')::real, (e->>'kp')::double precision,
               (e->>'collection_id')::integer, (e->>'pick_propensity')::double precision
        from jsonb_array_elements(v_new) e where (e->>'pw')::real > 0
      ) u;
    end if;

    -- The previous cards' franchises, oldest first (a null is a film with none).
    select coalesce(array_agg(w.coll order by w.sort_key), '{}') into v_window
    from (
      select t.collection_id as coll, d.sort_key
      from public.deck_entries d
      join public.titles t on t.id = d.title_id
      where d.room_member_id = v_seat
      order by d.sort_key desc
      limit c_window - 1
    ) w;

    v_dealt := '{}';
    v_cards := '[]';
    for v_pos in 1..v_n loop
      v_is_pick := floor(0.5 + (v_have + v_pos) * v_s) > floor(0.5 + (v_have + v_pos - 1) * v_s);
      v_found := null;
      for v_try in 1..2 loop
        v_list := case when v_is_pick = (v_try = 1) then v_pick else v_open end;
        for v_i in 0..jsonb_array_length(v_list) - 1 loop
          continue when (v_list->v_i->>'title_id')::bigint = any (v_dealt);
          v_coll := (v_list->v_i->>'coll')::integer;
          if v_coll is null or not coalesce(v_coll = any (v_window), false) then
            v_found := v_list->v_i;
            exit;
          end if;
        end loop;
        exit when v_found is not null;
      end loop;
      exit when v_found is null;
      v_dealt := v_dealt || (v_found->>'title_id')::bigint;
      v_coll := (v_found->>'coll')::integer;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'title_id', v_found->'title_id', 'score', v_found->'score',
        'propensity', v_found->'propensity',
        'source', case when v_state = 'dealing' and v_pos <= c_opening then 'opening' else 'ranked' end));
      v_window := array_append(v_window, v_coll);
      if cardinality(v_window) > c_window - 1 then
        v_window := v_window[cardinality(v_window) - c_window + 2 : cardinality(v_window)];
      end if;
    end loop;

    v_decks := v_decks || jsonb_build_array(jsonb_build_object('room_member_id', v_seat, 'cards', v_cards));
  end loop;

  -- M1.13: a refill with nothing to deal changes nothing, so it logs no request
  -- and broadcasts no deck_updated. A start still goes through deal_cards, which
  -- moves the room to swiping (too few films is M5.5's to handle).
  if v_state = 'swiping' then
    select coalesce(jsonb_agg(d), '[]') into v_decks
    from jsonb_array_elements(v_decks) d where jsonb_array_length(d->'cards') > 0;
    if jsonb_array_length(v_decks) = 0 then
      return jsonb_build_object('status', 'ok', 'request_id', null, 'started', false, 'seats', 0);
    end if;
  end if;

  -- Only the new films join the pool; the pool films were dealt before.
  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', x.e->'title_id', 'group_score', x.e->'group_score', 'min_fit', x.e->'min_fit', 'fits', x.e->'fits')
         order by x.ord), '[]')
  into v_pool
  from jsonb_array_elements(v_new) with ordinality as x(e, ord)
  where (x.e->>'title_id')::bigint in (
    select (c->>'title_id')::bigint
    from jsonb_array_elements(v_decks) d, jsonb_array_elements(d->'cards') c);

  return internal.deal_cards(p_room_id, jsonb_build_object(
    'request', jsonb_build_object(
      'kind', case when v_state = 'dealing' then 'start' else 'refill' end,
      'model_version', 'sql-baseline', 'is_fallback', true,
      'room_member_id', p_seat, 'candidates', jsonb_array_length(v_raw)),
    'pool', v_pool,
    'decks', v_decks));
end
$$;

-- ---------------------------------------------------------------------------------------
-- api.set_seat_prefs: genres capped at 3 and checked against tonight's offer, locked once
-- the room has started. Providers and moods are unchanged. A call that changes only genres
-- sends genres_changed (empty) and no seat_updated, which would name the seat.
-- ---------------------------------------------------------------------------------------
create or replace function api.set_seat_prefs(
  p_room_id uuid,
  p_provider_ids integer[] default null,
  p_mood_slugs text[] default null,
  p_genre_ids integer[] default null,
  p_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_seat uuid;
  v_state public.room_state;
  v_country char(2);
  v_provider_ids integer[];
  v_genre_ids integer[];
  v_before integer[];
begin
  -- Over a cap is refused whole, nothing saved: a correct app never sends more.
  if cardinality(p_provider_ids) > 50 then
    return jsonb_build_object('status', 'too_many', 'field', 'provider_ids', 'max', 50);
  end if;
  if cardinality(p_mood_slugs) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'mood_slugs', 'max', 3);
  end if;
  if cardinality(p_genre_ids) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'genre_ids', 'max', 3);
  end if;

  select r.state, r.country into v_state, v_country from public.rooms r
  where r.id = p_room_id for no key update;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;
  if v_state not in ('lobby', 'swiping') and not (p_genre_ids is not null and v_state in ('dealing', 'finale')) then
    return jsonb_build_object('status', 'closed');
  end if;

  select m.id, m.genre_ids into v_seat, v_before from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()));
  if v_seat is null then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if p_genre_ids is not null then
    -- Picks lock at Start; late joiners play the deck as it is.
    if v_state <> 'lobby' then
      return jsonb_build_object('status', 'locked');
    end if;
    if exists (select 1 from unnest(p_genre_ids) g
               where g is null or g not in (select o.genre_id from internal.offered_genres(p_room_id) o)) then
      return jsonb_build_object('status', 'unknown_genre');
    end if;
    -- A repeated genre is kept once, in the order sent.
    select coalesce(array_agg(x.g order by x.o), '{}') into v_genre_ids
    from (select g, min(o) as o from unnest(p_genre_ids) with ordinality as t(g, o) group by g) x;
  end if;

  -- Services not listed in the room's country are dropped silently (null stays null).
  if p_provider_ids is not null then
    select coalesce(array_agg(t.p order by t.o), '{}') into v_provider_ids
    from unnest(p_provider_ids) with ordinality as t(p, o)
    where exists (select 1 from public.provider_regions pr where pr.provider_id = t.p and pr.country = v_country);
  end if;
  update public.room_members m
  set provider_ids = coalesce(v_provider_ids, m.provider_ids),
      mood_slugs = coalesce(p_mood_slugs, m.mood_slugs),
      genre_ids = coalesce(v_genre_ids, m.genre_ids),
      last_active_at = now()
  where m.id = v_seat;

  perform internal.refresh_room_providers(p_room_id);
  if p_provider_ids is not null or p_mood_slugs is not null or p_genre_ids is null then
    perform internal.broadcast_room(p_room_id, 'seat_updated', jsonb_build_object('member_id', v_seat));
  end if;
  if v_genre_ids is not null and v_genre_ids is distinct from v_before then
    perform internal.broadcast_room(p_room_id, 'genres_changed', '{}'::jsonb);
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;

-- ---------------------------------------------------------------------------------------
-- api.room_genres: the genres offered tonight with how many present seats picked each, and
-- the caller's own picks. Never a seat id or a name. After Start the films already dealt
-- still count toward the 30, so the offer does not shrink as the game runs.
-- ---------------------------------------------------------------------------------------
create function api.room_genres(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_started boolean;
  v_answer jsonb;
begin
  if not internal.is_room_member(p_room_id) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  select r.state <> 'lobby' into v_started from public.rooms r where r.id = p_room_id;

  with offered as (
    select o.genre_id from internal.offered_genres(p_room_id, coalesce(v_started, false)) o
  ),
  present as (
    select m.genre_ids from public.room_members m
    where m.id = any (internal.present_member_ids(p_room_id)) and m.removed_at is null
  ),
  me as (
    select m.genre_ids from public.room_members m
    where m.room_id = p_room_id and m.profile_id = internal.my_profile_id() and m.removed_at is null
    limit 1
  )
  select jsonb_build_object(
    'status', 'ok',
    'options', coalesce((
      select jsonb_agg(jsonb_build_object('genre_id', o.genre_id,
               'count', (select count(*) from present p where o.genre_id = any (p.genre_ids)))
             order by o.genre_id)
      from offered o), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(u.g order by u.ord)
      from me cross join lateral unnest(me.genre_ids) with ordinality as u(g, ord)
      where u.g in (select genre_id from offered)), '[]'::jsonb))
  into v_answer;
  return v_answer;
end
$$;

revoke execute on function api.room_genres(uuid) from public, anon;
grant execute on function api.room_genres(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- api.start_game: the 20261102220000 version, plus the picks locked as the room starts dealing.
-- ---------------------------------------------------------------------------------------
create or replace function api.start_game(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_min smallint;
begin
  select r.* into v_room from public.rooms r
  where r.id = p_room_id
    and exists (select 1 from public.room_members m
                where m.room_id = r.id and m.role = 'host' and m.profile_id = internal.my_profile_id()
                  and m.left_at is null)
  for no key update;
  if not found then
    raise exception 'only the host can start' using errcode = '42501';
  end if;

  if v_room.state = 'dealing' then
    if now() - v_room.dealing_at > interval '8 seconds' then
      return internal.deal_baseline(p_room_id) || jsonb_build_object('fallback', true);
    end if;
    return jsonb_build_object('status', 'dealing');
  end if;
  if v_room.state <> 'lobby' then
    return jsonb_build_object('status', 'closed', 'state', v_room.state);
  end if;

  select gm.min_players into v_min from public.game_modes gm where gm.slug = v_room.mode;
  if cardinality(internal.present_member_ids(p_room_id)) < v_min then
    return jsonb_build_object('status', 'not_enough_players', 'need', v_min);
  end if;

  update public.rooms set state = 'dealing', dealing_at = now() where id = p_room_id;
  -- Picks lock at Start (M6.53): the present seats' offered picks drive every deal from here.
  perform internal.lock_genre_picks(p_room_id);
  if internal.deck_engine() = 'sql' then
    -- The dealing broadcast stays (Q13.5): swiping follows it from the same commit.
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'dealing'));
    return internal.deal_baseline(p_room_id);
  end if;
  perform internal.enqueue('deck_requests', jsonb_build_object('kind', 'start', 'room_id', p_room_id));
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'dealing'));
  return jsonb_build_object('status', 'dealing');
end
$$;

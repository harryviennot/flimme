-- M6.50: Later on the server (decisions.md "Later, the name and the bookmark", 6 Nov 2026;
-- solo-and-my-films.md sections 5, 6 and 10; privacy.md "Film history").
-- A player saves a film dealt to them for Later: user_titles.saved_at on their app row, its own column
-- (never on_watchlist, which is Letterboxd's and feeds labels). A save is not an answer: no room, deck
-- counter, match, near miss, shortlist, finalist, label, card payload, event or log reads it. Only
-- My films, the film sheet, the export, the pruner and the solo deck's My films skip do.
-- Replaced whole from 20261105180100_my_films.sql: internal.prune_film_rows (keeps a saved row),
-- internal.deck_candidates (the solo skip also leaves out saved films), api.export_my_data (saved_at),
-- api.my_films (the later segment), api.my_film_card (answers saved). api.set_film_saved is new.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.user_titles add column if not exists saved_at timestamptz;

-- Deletes the player's app and solo rows for a film that hold nothing any more, a save included.
create or replace function internal.prune_film_rows(p_profile_id uuid, p_title_id bigint) returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.user_titles ut
  where ut.profile_id = p_profile_id and ut.title_id = p_title_id and ut.source in ('app', 'solo')
    and not ut.seen and ut.rating is null and not ut.on_watchlist and ut.reaction is null
    and ut.rewatch_count = 0 and ut.last_watched_on is null
    and ut.liked_at is null and not ut.super_liked and ut.picked_at is null
    and ut.saved_at is null
$$;
revoke execute on function internal.prune_film_rows(uuid, bigint) from public, anon, authenticated;

-- Solo rooms also leave out saved films (M6.50). Same signature and return type.
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
      -- A solo room leaves out every film the player answered, with any answer, in another solo room
      -- (an undone vote is gone, so that film may come back). Group rooms are not filtered.
      and (r.mode <> 'solo' or not exists (
            select 1 from public.votes v
            join public.room_members vm on vm.id = v.room_member_id
            join public.rooms vr on vr.id = vm.room_id
            where v.title_id = t.id and vr.mode = 'solo' and vr.id <> p_room_id
              and vm.profile_id in (select mm.profile_id from members mm)))
      -- ... and every film already in the player's My films: liked, super liked, picked (M6.41) or
      -- saved for Later (M6.50). Group rooms never read saved_at.
      and (r.mode <> 'solo' or not exists (
            select 1 from public.user_titles lu
            where lu.title_id = t.id and (lu.liked_at is not null or lu.picked_at is not null or lu.saved_at is not null)
              and lu.profile_id in (select mm.profile_id from members mm)))
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

-- The export carries saved_at (M6.50).
create or replace function api.export_my_data() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if internal.my_profile_id() is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('export:p:' || internal.my_profile_id(), 1, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  return (
  with me as (select internal.my_profile_id() as id)
    select jsonb_build_object('status', 'ok') || jsonb_build_object(
      'profile', (select to_jsonb(p) - 'auth_user_id' from public.profiles p, me where p.id = me.id),
      'services', (select coalesce(jsonb_agg(pp.provider_id), '[]') from public.profile_providers pp, me where pp.profile_id = me.id),
      'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id'), '[]') from public.consents c, me where c.profile_id = me.id),
      'linked_accounts', (
        select coalesce(jsonb_agg(jsonb_build_object('provider', la.provider, 'username', la.username,
                                                     'created_at', la.created_at, 'exported_at', la.exported_at,
                                                     'last_synced_at', la.last_synced_at)), '[]')
        from public.linked_accounts la, me where la.profile_id = me.id),
      'letterboxd_diary', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'film', e.film_name, 'year', e.film_year, 'watched_on', e.watched_on, 'rating', e.rating,
                 'rewatch', e.rewatch, 'source', e.source) order by e.watched_on), '[]')
        from public.letterboxd_entries e join public.linked_accounts la on la.id = e.linked_account_id, me
        where la.profile_id = me.id),
      'film_history', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'tmdb_id', t.tmdb_id, 'title', t.original_title, 'source', ut.source, 'seen', ut.seen,
                 'rating', ut.rating, 'on_watchlist', ut.on_watchlist,
                 'reaction', ut.reaction, 'last_watched_on', ut.last_watched_on,
                 'liked_at', ut.liked_at, 'super_liked', ut.super_liked, 'picked_at', ut.picked_at,
                 'seen_at', ut.seen_at, 'saved_at', ut.saved_at)), '[]')
        from public.user_titles ut join public.titles t on t.id = ut.title_id, me
        where ut.profile_id = me.id),
      'taste', (select tp.affinities from public.taste_profiles tp, me where tp.profile_id = me.id),
      'games', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'room_id', m.room_id, 'mode', (select r.mode from public.rooms r where r.id = m.room_id), 'joined_at', m.joined_at, 'left_at', m.left_at,
                 'display_name', m.display_name, 'avatar_key', m.avatar_key, 'role', m.role,
                 'joined_via', m.joined_via, 'services', to_jsonb(m.provider_ids),
                 'votes', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'tmdb_id', t.tmdb_id, 'title', t.original_title, 'answer', v.answer,
                                  'at', v.created_at) order by v.created_at, t.tmdb_id), '[]')
                           from public.votes v join public.titles t on t.id = v.title_id
                           where v.room_member_id = m.id),
                 'swipes', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'tmdb_id', t.tmdb_id, 'action', s.action, 'answer', s.answer,
                                   'at', s.created_at, 'dwell_ms', s.dwell_ms) order by s.created_at, s.id), '[]')
                            from public.swipe_log s join public.titles t on t.id = s.title_id
                            where s.room_member_id = m.id),
                 'ballots', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'tmdb_id', t.tmdb_id, 'kind', b.kind, 'rank', b.rank,
                                    'at', b.created_at) order by b.created_at, b.id), '[]')
                             from public.round_ballots b left join public.titles t on t.id = b.title_id
                             where b.room_member_id = m.id),
                 'pick', (select jsonb_build_object('tmdb_id', t.tmdb_id, 'title', t.original_title, 'kind', mt.kind)
                          from public.matches mt join public.titles t on t.id = mt.title_id
                          where mt.room_id = m.room_id and mt.pick_order = 1),
                 'watched_answer', m.watched_answer,
                 'post_reaction', m.post_reaction) order by m.joined_at, m.id), '[]')
        from public.room_members m, me where m.profile_id = me.id)
    )
  );
end
$$;

-- My films: Liked, Seen or Later (M6.50: saved films, newest save first, no badge, the filter ignored).
create or replace function api.my_films(
  p_segment text,
  p_filter text default 'all',
  p_cursor text default null,
  p_language text default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_lang text;
  v_after_at bigint;
  v_after_id bigint;
  v_films jsonb;
  v_next text;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if p_segment is null or p_segment not in ('liked', 'seen', 'later') then
    raise exception 'unknown segment' using errcode = '22023';
  end if;
  if p_filter is null or p_filter not in ('all', 'friends', 'solo') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^-?[0-9]{1,18}_[0-9]{1,18}$' then
      raise exception 'bad cursor' using errcode = '22023';
    end if;
    v_after_at := split_part(p_cursor, '_', 1)::bigint;
    v_after_id := split_part(p_cursor, '_', 2)::bigint;
  end if;

  update public.profiles set last_seen_at = now() where id = v_profile;
  v_lang := coalesce(p_language, (select p.language from public.profiles p where p.id = v_profile), 'en');

  with picked as (
    select ut.title_id,
           case when p_segment = 'liked' then greatest(ut.liked_at, case when ut.source = 'app' then ut.picked_at end)
                when p_segment = 'later' then ut.saved_at
                else coalesce(ut.seen_at, ut.updated_at) end as at,
           p_segment = 'liked' and ut.super_liked as star,
           p_segment = 'liked' and ut.source = 'app' and ut.picked_at is not null as pick
    from public.user_titles ut
    where ut.profile_id = v_profile and ut.source in ('app', 'solo')
      and case
            when p_segment = 'seen' then ut.seen
            when p_segment = 'later' then ut.saved_at is not null
            when p_filter = 'all' then ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)
            when p_filter = 'friends' then ut.source = 'app' and (ut.liked_at is not null or ut.picked_at is not null)
            else ut.source = 'solo' and ut.liked_at is not null
          end
  ),
  tiles as (
    select pk.title_id, max(pk.at) as at, bool_or(pk.pick) as is_picked, bool_or(pk.star) as is_super_liked,
           (extract(epoch from max(pk.at)) * 1000000)::bigint as k
    from picked pk group by pk.title_id
  ),
  page as (
    select tl.*, row_number() over (order by tl.k desc, tl.title_id desc) as rn
    from tiles tl
    where v_after_at is null or (tl.k, tl.title_id) < (v_after_at, v_after_id)
    order by tl.k desc, tl.title_id desc
    limit 61
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', t.id,
           'title', coalesce(tr.title, en.title, t.original_title),
           'year', t.release_year,
           'poster_path', coalesce(tr.poster_path, t.poster_path),
           'is_picked', pg.is_picked,
           'is_super_liked', pg.is_super_liked,
           'at', pg.at) order by pg.rn) filter (where pg.rn <= 60), '[]'),
         case when count(*) > 60 then (select x.k || '_' || x.title_id from page x where x.rn = 60) end
  into v_films, v_next
  from page pg
  join public.titles t on t.id = pg.title_id
  left join public.title_translations tr on tr.title_id = t.id and tr.language = v_lang
  left join public.title_translations en on en.title_id = t.id and en.language = 'en';

  return jsonb_build_object('status', 'ok', 'films', v_films, 'next_cursor', v_next);
end
$$;
revoke execute on function api.my_films(text, text, text, text) from public, anon;
grant execute on function api.my_films(text, text, text, text) to authenticated;

-- The film sheet's card also says whether the film is saved, for Remove from Later (M6.50).
create or replace function api.my_film_card(p_title_id bigint, p_language text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_rows integer;
  v_seen boolean;
  v_liked boolean;
  v_saved boolean;
  v_card jsonb;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('my_film_card:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select count(*), coalesce(bool_or(ut.seen), false),
         coalesce(bool_or(ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)), false),
         coalesce(bool_or(ut.saved_at is not null), false)
  into v_rows, v_seen, v_liked, v_saved
  from public.user_titles ut
  where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo');
  if v_rows = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_card := internal.profile_card_payloads(
    v_profile, p_title_id,
    coalesce(p_language, (select p.language from public.profiles p where p.id = v_profile), 'en'));
  if v_card is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'card', v_card, 'seen', v_seen, 'liked', v_liked, 'saved', v_saved);
end
$$;
revoke execute on function api.my_film_card(bigint, text) from public, anon;
grant execute on function api.my_film_card(bigint, text) to authenticated;

-- Save for Later (only a film dealt in a room where the caller has or had a seat, or one already in
-- their own rows) or Remove from Later. A save lands on the app row whatever room it came from; a
-- second save keeps the first time. It is not a vote: no room table, swipe_log or Realtime message.
create function api.set_film_saved(p_title_id bigint, p_saved boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_changed integer;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if p_saved is null then
    raise exception 'saved needs a value' using errcode = '22023';
  end if;
  if not internal.rate_limit('film_edit:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if p_saved then
    if not exists (select 1 from public.user_titles ut
                   where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo'))
       and not exists (select 1 from public.room_cards rc
                       join public.room_members m on m.room_id = rc.room_id
                       where rc.title_id = p_title_id and m.profile_id = v_profile) then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.user_titles as ut (profile_id, title_id, source, saved_at)
    values (v_profile, p_title_id, 'app', now())
    on conflict (profile_id, title_id, source) do update
      set saved_at = now(), updated_at = now()
      where ut.saved_at is null;
  else
    update public.user_titles ut
    set saved_at = null, updated_at = now()
    where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo')
      and ut.saved_at is not null;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then
      return jsonb_build_object('status', 'not_found');
    end if;
    perform internal.prune_film_rows(v_profile, p_title_id);
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;
revoke execute on function api.set_film_saved(bigint, boolean) from public, anon;
grant execute on function api.set_film_saved(bigint, boolean) to authenticated;

-- Later as solo likes (decisions.md, 6 Nov 2026; solo-and-my-films.md sections 5, 6 and 10; privacy.md
-- "Film history"). "Later" and "Liked" are the same wish: saving a film during a game records a solo
-- like, the same row, source and liked_at a like in a solo session writes, so My films lists it under
-- Liked with the Solo chip. saved_at stays, on that solo row only, as the mark that a save made the
-- like: unsaving takes back only that, never a like from a game. The Later segment is gone.
-- A save is still not an answer: it lands on the solo row, which no room reads, so it never counts
-- for a match, a near miss, the shortlist or the finalists. Solo decks skip it as they skip any like
-- (internal.eligible_titles, unchanged: a saved like has liked_at).
-- Replaced whole from 20261106121423_my_films_later.sql: internal.prune_film_rows (a save no longer
-- keeps a row by itself), api.my_films (no later segment), api.my_film_card (no saved flag),
-- api.set_film_saved (writes a solo like). api.remove_my_film (20261105180100) also clears saved_at.
-- These change in place, not as _v2: no shipped app calls them (production never received M6.50 and
-- the TestFlight build predates it).

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Deletes the player's app and solo rows for a film that hold nothing any more. A saved like is pruned
-- like any like: saved_at only marks where liked_at came from.
create or replace function internal.prune_film_rows(p_profile_id uuid, p_title_id bigint) returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.user_titles ut
  where ut.profile_id = p_profile_id and ut.title_id = p_title_id and ut.source in ('app', 'solo')
    and not ut.seen and ut.rating is null and not ut.on_watchlist and ut.reaction is null
    and ut.rewatch_count = 0 and ut.last_watched_on is null
    and ut.liked_at is null and not ut.super_liked and ut.picked_at is null
$$;
revoke execute on function internal.prune_film_rows(uuid, bigint) from public, anon, authenticated;

-- Saves made under M6.50 (on the app row, staging only) become solo likes, unless the film is already
-- liked or picked; then the app rows forget them, and a row left with nothing goes.
insert into public.user_titles as ut (profile_id, title_id, source, liked_at, saved_at)
select a.profile_id, a.title_id, 'solo', a.saved_at, a.saved_at
from public.user_titles a
where a.source = 'app' and a.saved_at is not null
  and not exists (
    select 1 from public.user_titles l
    where l.profile_id = a.profile_id and l.title_id = a.title_id and l.source in ('app', 'solo')
      and (l.liked_at is not null or (l.source = 'app' and l.picked_at is not null)))
on conflict (profile_id, title_id, source) do update
  set liked_at = excluded.liked_at, saved_at = excluded.saved_at, updated_at = now()
  where ut.liked_at is null;

do $$
declare
  r record;
begin
  for r in
    update public.user_titles set saved_at = null, updated_at = now()
    where source = 'app' and saved_at is not null
    returning profile_id, title_id
  loop
    perform internal.prune_film_rows(r.profile_id, r.title_id);
  end loop;
end
$$;

-- My films: Liked or Seen. A saved like is a solo like, so it is listed under Liked (All and Solo).
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
  if p_segment is null or p_segment not in ('liked', 'seen') then
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
                else coalesce(ut.seen_at, ut.updated_at) end as at,
           p_segment = 'liked' and ut.super_liked as star,
           p_segment = 'liked' and ut.source = 'app' and ut.picked_at is not null as pick
    from public.user_titles ut
    where ut.profile_id = v_profile and ut.source in ('app', 'solo')
      and case
            when p_segment = 'seen' then ut.seen
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

-- The film sheet's card, with the caller's own seen and liked flags. A saved film is liked.
create or replace function api.my_film_card(p_title_id bigint, p_language text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_rows integer;
  v_seen boolean;
  v_liked boolean;
  v_card jsonb;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('my_film_card:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select count(*), coalesce(bool_or(ut.seen), false),
         coalesce(bool_or(ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)), false)
  into v_rows, v_seen, v_liked
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
  return jsonb_build_object('status', 'ok', 'card', v_card, 'seen', v_seen, 'liked', v_liked);
end
$$;
revoke execute on function api.my_film_card(bigint, text) from public, anon;
grant execute on function api.my_film_card(bigint, text) to authenticated;

-- Remove from Liked: clears the like, the star, the pick and a save's mark on the caller's app and solo
-- rows. The seen mark stays; a row left with nothing goes. A game's votes are never touched.
create or replace function api.remove_my_film(p_title_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_changed integer;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('film_edit:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update public.user_titles ut
  set liked_at = null, super_liked = false, picked_at = null, saved_at = null, updated_at = now()
  where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo')
    and (ut.liked_at is not null or ut.super_liked or ut.picked_at is not null);
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform internal.prune_film_rows(v_profile, p_title_id);
  return jsonb_build_object('status', 'ok');
end
$$;
revoke execute on function api.remove_my_film(bigint) from public, anon;
grant execute on function api.remove_my_film(bigint) to authenticated;

-- Save (only a film dealt in a room where the caller has or had a seat, or one already in their own
-- rows): a solo like, liked_at and saved_at on the solo row, at the same time. A film already liked or
-- picked, from a group or solo, keeps that like as it is: ok, nothing changes.
-- Unsave: only a like a save made (saved_at on the solo row). If the player also liked the film in a
-- solo game after the save, that like stays, with that vote's time (so undoing the vote still takes it back), and only
-- the mark goes; otherwise the like goes and a row left with nothing is deleted.
-- Neither is a vote: no room table, swipe_log or Realtime message.
create or replace function api.set_film_saved(p_title_id bigint, p_saved boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_voted_at timestamptz;
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
    if exists (select 1 from public.user_titles ut
               where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo')
                 and (ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null))) then
      return jsonb_build_object('status', 'ok');
    end if;
    insert into public.user_titles as ut (profile_id, title_id, source, liked_at, saved_at)
    values (v_profile, p_title_id, 'solo', now(), now())
    on conflict (profile_id, title_id, source) do update
      set liked_at = excluded.liked_at, saved_at = excluded.saved_at, updated_at = now()
      where ut.liked_at is null;
    return jsonb_build_object('status', 'ok');
  end if;

  -- The first like, super like or "watch it again" the player gave this film in a solo room since the
  -- save. An older one was already gone when the player saved (a save of a liked film writes nothing),
  -- so it never comes back.
  select min(v.created_at) into v_voted_at
  from public.votes v
  join public.room_members m on m.id = v.room_member_id
  join public.rooms r on r.id = m.room_id
  join public.user_titles ut on ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source = 'solo'
  where m.profile_id = v_profile and v.title_id = p_title_id and r.mode = 'solo'
    and v.answer in ('like', 'super_like', 'seen_rewatch')
    and v.created_at >= ut.saved_at;

  update public.user_titles ut
  set liked_at = v_voted_at,
      super_liked = v_voted_at is not null and ut.super_liked,
      saved_at = null,
      updated_at = now()
  where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source = 'solo'
    and ut.saved_at is not null;
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform internal.prune_film_rows(v_profile, p_title_id);
  return jsonb_build_object('status', 'ok');
end
$$;
revoke execute on function api.set_film_saved(bigint, boolean) from public, anon;
grant execute on function api.set_film_saved(bigint, boolean) to authenticated;

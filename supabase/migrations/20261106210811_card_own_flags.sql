-- M6.65: the card carries the caller's own seen and saved flags (decisions.md, 6 Nov 2026, changing
-- M6.50's default Q50.8 "room cards never carry the saved state"). api.my_next_cards and
-- api.title_cards add two booleans per card, read at call time from the player's own user_titles
-- rows (sources app and solo, as My films reads them):
--   seen:  the film is in the player's My films, Seen (a seen mark).
--   saved: the film is in the player's My films likes (a game like, a solo like, a save, or a
--          group's pick), as api.my_film_card's liked.
-- my_next_cards reads the seat's player; title_cards reads the caller. The flags are never stored in
-- room_cards or deck_entries and never broadcast, so no other seat can read them (rule 6). Each card
-- costs one primary key lookup on user_titles (profile_id, title_id, source). Adding fields is
-- compatible, so no _v2.
-- Replaced whole: api.my_next_cards from 20261103193809_card_payloads_for_the_room.sql and
-- api.title_cards from 20261103202615_title_cards_for_the_room.sql. Signatures, orders, limits and
-- the other fields are unchanged.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function api.my_next_cards(
  p_room_id uuid,
  p_limit integer default 10,
  p_member_id uuid default null,
  p_language text default null
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with seat as (
    select m.id, m.profile_id
    from public.room_members m
    where m.room_id = p_room_id
      and m.removed_at is null
      and m.controlled_by in (select internal.my_profile_ids())
      and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
  ),
  upcoming as (
    select d.title_id, d.sort_key, d.source, c.reason_code, c.reason_params, c.member_ratings, s.profile_id
    from seat s
    join public.deck_entries d on d.room_member_id = s.id
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
    order by d.sort_key
    limit least(greatest(p_limit, 1), 30)
  ),
  cards as (
    select cp.title_id, cp.card
    from internal.card_payloads(
      p_room_id,
      (select array_agg(u.title_id) from upcoming u),
      coalesce(p_language, (select p.language from public.profiles p where p.id = internal.my_profile_id()), 'en')) cp
  )
  select coalesce(jsonb_agg(c.card || jsonb_build_object(
           'deck_source', u.source, 'reason_code', u.reason_code,
           'reason_params', u.reason_params, 'member_ratings', u.member_ratings,
           'seen', f.seen, 'saved', f.liked)
         order by u.sort_key), '[]')
  from upcoming u
  join cards c on c.title_id = u.title_id
  -- The seat's own marks only; a seat with no profile has none.
  cross join lateral (
    select coalesce(bool_or(ut.seen), false) as seen,
           coalesce(bool_or(ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)), false) as liked
    from public.user_titles ut
    where ut.profile_id = u.profile_id and ut.title_id = u.title_id and ut.source in ('app', 'solo')
  ) f
$$;

-- The room's films as cards, for the match, the shortlist, the finale and the runners-up.
create or replace function api.title_cards(p_room_id uuid, p_title_ids bigint[], p_language text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_cards jsonb;
begin
  if v_profile is null or not internal.is_room_member(p_room_id) then
    raise exception 'not in this room' using errcode = '42501';
  end if;

  -- Checked before the rate limit, so a refused call costs nothing.
  if coalesce(cardinality(p_title_ids), 0) > 50 then
    return jsonb_build_object('status', 'too_many', 'max', 50);
  end if;

  if not internal.rate_limit('title_cards:p:' || v_profile, 30, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(cp.card || jsonb_build_object('seen', f.seen, 'saved', f.liked)
                            order by array_position(p_title_ids, cp.title_id)), '[]')
  into v_cards
  from internal.card_payloads(
    p_room_id,
    coalesce((
      select array_agg(c.title_id)
      from public.room_cards c
      where c.room_id = p_room_id and c.title_id = any (p_title_ids)), '{}'),
    coalesce(p_language, (select p.language from public.profiles p where p.id = v_profile), 'en')
  ) cp
  -- The caller's own marks only.
  cross join lateral (
    select coalesce(bool_or(ut.seen), false) as seen,
           coalesce(bool_or(ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)), false) as liked
    from public.user_titles ut
    where ut.profile_id = v_profile and ut.title_id = cp.title_id and ut.source in ('app', 'solo')
  ) f;

  return jsonb_build_object('status', 'ok', 'cards', v_cards);
end
$$;

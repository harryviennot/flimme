-- M1.8: removed seats lose room access, and seats that left can't send
-- (security.md#the-database-gaps-found, gap 3, access part). Before this, anyone
-- who ever sat in a room kept reading its seats, matches and rounds, kept both
-- Realtime topics and could keep sending on room:<id>:live.
--
-- A removed seat (removed_at set) is not a member at all. A seat that left
-- (left_at set) keeps reading, for history and rejoining, but can't send on
-- :live. Nothing sets removed_at until M4.2 (api.remove_member).
--
-- The five member_read policies and the two realtime.messages policies are
-- unchanged: they pick this up through the two functions. Grants are unchanged
-- (create or replace keeps them), and the new column opens nothing to anon.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.room_members add column removed_at timestamptz;

-- A seat in the room that one of my profiles controls, and that was not removed.
create or replace function internal.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id
      and m.removed_at is null
      and m.controlled_by in (select internal.my_profile_ids())
  )
$$;

-- Realtime topics are 'room:<id>' (server events) and 'room:<id>:live'
-- (presence and reactions sent by phones). Reading either: a member (seats that
-- left still count). Sending on :live: a seat that is still present. Sending on
-- room:<id>: nobody.
create or replace function internal.can_use_room_topic(p_topic text, p_send boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_topic ~ '^room:[0-9a-f-]{36}$' then not p_send and internal.is_room_member(substring(p_topic from 6 for 36)::uuid)
    when p_topic ~ '^room:[0-9a-f-]{36}:live$' then
      case when p_send then exists (
        select 1 from public.room_members m
        where m.room_id = substring(p_topic from 6 for 36)::uuid
          and m.left_at is null
          and m.removed_at is null
          and m.controlled_by in (select internal.my_profile_ids())
      )
      else internal.is_room_member(substring(p_topic from 6 for 36)::uuid) end
    else false
  end
$$;

-- The seat's next cards: a removed seat gets none.
create or replace function api.my_next_cards(
  p_room_id uuid,
  p_limit integer default 10,
  p_member_id uuid default null,
  p_language text default null
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with seat as (
    select m.id, r.country, r.provider_ids
    from public.room_members m join public.rooms r on r.id = m.room_id
    where m.room_id = p_room_id
      and m.removed_at is null
      and m.controlled_by in (select internal.my_profile_ids())
      and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
  ),
  upcoming as (
    select d.title_id, d.sort_key, d.source, c.reason_code, c.reason_params, c.member_ratings
    from seat s
    join public.deck_entries d on d.room_member_id = s.id
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
    order by d.sort_key
    limit least(greatest(p_limit, 1), 30)
  ),
  cards as (
    select cp.title_id, cp.card
    from seat s,
      internal.card_payloads(
        (select array_agg(u.title_id) from upcoming u),
        coalesce(p_language, (select p.language from public.profiles p where p.id = internal.my_profile_id()), 'en'),
        s.country, s.provider_ids) cp
  )
  select coalesce(jsonb_agg(c.card || jsonb_build_object(
           'deck_source', u.source, 'reason_code', u.reason_code,
           'reason_params', u.reason_params, 'member_ratings', u.member_ratings)
         order by u.sort_key), '[]')
  from upcoming u join cards c on c.title_id = u.title_id
$$;

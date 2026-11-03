-- M4.5: when the host leaves, the role goes to the longest-seated present player. If nobody
-- else is present, to the longest-seated seat that hasn't left. If nobody else is seated,
-- no seat gets it (rooms.host_id stays as it is). game-modes.md#who-counts-presence-joining-and-leaving.
-- internal.next_host_member is shared with M6.6's sweeper for a silent host.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The seat that should hold the host role: present first (same test as
-- internal.present_member_ids), then longest-seated, ties on the seat id. Seats that left
-- or were removed are never picked. Null if there is none. Callers hold the room lock and
-- have already set the leaver's left_at.
create function internal.next_host_member(p_room_id uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id
  from public.room_members m
  where m.room_id = p_room_id
    and m.left_at is null
    and m.removed_at is null
  order by (m.last_active_at > now() - interval '90 seconds') desc, m.joined_at, m.id
  limit 1
$$;

revoke all on function internal.next_host_member(uuid) from public, anon, authenticated;

create or replace function api.leave_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_next uuid;
  v_title bigint;
  v_check jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id and m.profile_id = internal.my_profile_id() and m.left_at is null;
  if not found then
    return jsonb_build_object('status', 'not_in_room');
  end if;

  update public.room_members set left_at = now() where id = v_member.id;

  if v_member.role = 'host' then
    v_next := internal.next_host_member(p_room_id);
    update public.room_members set role = 'guest' where id = v_member.id;
    if v_next is not null then
      update public.room_members set role = 'host' where id = v_next;
      update public.rooms set host_id = (select profile_id from public.room_members where id = v_next)
      where id = p_room_id;
    end if;
  end if;

  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'member_left', jsonb_build_object(
    'member_id', v_member.id, 'new_host_member_id', v_next));

  if v_room.state = 'swiping' then
    for v_title in
      select c.title_id from public.room_cards c
      where c.room_id = p_room_id and c.state = 'active' and c.like_count + c.super_like_count > 0
      order by c.like_count + c.super_like_count desc
    loop
      v_check := internal.check_card_match(p_room_id, v_title);
      exit when (v_check->>'decided') = 'true';
    end loop;
  end if;

  return jsonb_build_object('status', 'ok');
end
$$;

-- M4.19: api.room_preview(code, ref) tells a link holder who invited them and how many
-- are in, without a seat. It needs the room reference (rooms.id), so a typed code cannot
-- use it to probe codes, and it names only the host, never another player.
-- Read only: it writes nothing but its own rate limit rows.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Own buckets (10 per profile, 30 per address, per 10 minutes), apart from join's, and a
-- closed answer does not count as a failed join. Limits answer rate_limited, never raise.
create function api.room_preview(p_code text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_ip text;
  v_players integer;
  v_seated boolean;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  -- No reference, no preview: raises before any limit counts.
  if p_code is null or p_ref is null then
    raise exception 'code and ref are required' using errcode = '22023';
  end if;

  if not internal.rate_limit('preview:p:' || v_profile.id, 10, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  v_ip := internal.request_ip_key();
  if v_ip is not null and not internal.rate_limit('preview:ip:' || v_ip, 30, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_room from public.rooms
  where code = p_code and id = p_ref and state in ('lobby', 'dealing', 'swiping', 'finale');
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;

  select count(*) into v_players from public.room_members
  where room_id = v_room.id and left_at is null;
  select exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is null
  ) into v_seated;

  -- A seated caller goes straight back in, whatever the state or count (as join_room's rejoin).
  if not v_seated then
    if v_room.state = 'finale' then
      return jsonb_build_object('status', 'in_finale');
    end if;
    if v_players >= v_room.max_players then
      return jsonb_build_object('status', 'full', 'max_players', v_room.max_players);
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'state', v_room.state,
    'host_name', (select m.display_name from public.room_members m
                  where m.room_id = v_room.id and m.role = 'host' limit 1),
    'host_avatar_key', (select m.avatar_key from public.room_members m
                        where m.room_id = v_room.id and m.role = 'host' limit 1),
    'players', v_players,
    'max_players', v_room.max_players,
    'seated', v_seated
  );
end
$$;

grant execute on function api.room_preview(text, uuid) to authenticated;

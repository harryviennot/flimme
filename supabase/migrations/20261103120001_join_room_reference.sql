-- M4.1: invite links carry a room reference (rooms.id). api.join_room(code, ref, via,
-- link_opened_at) answers closed when the code no longer belongs to that room, and
-- stores how the seat came in. Additive: the old one-argument function is dropped
-- and the new one has defaults, so callers of join_room(code) still work.
-- Replaces api.join_room from 20261102220000_deck_engine_sql.sql.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- squawk-ignore prefer-robust-stmts
create type public.join_via as enum ('link', 'code', 'qr', 'rejoin', 'play_again');

-- Analytics only: api.room_seats does not list them, so phones never read them.
-- squawk-ignore prefer-robust-stmts
alter table public.room_members
  add column if not exists joined_via public.join_via,
  add column if not exists link_opened_at timestamptz;

-- Safe: the new function takes the same first argument with defaults, so callers
-- of join_room(code), by name or by position, still resolve.
-- squawk-ignore ban-drop-function
drop function api.join_room(text);

-- Never raises on a wrong code: an exception would roll back the attempt
-- counter and make the 6-digit space guessable. Limits, in order: 10 attempts
-- per profile and 30 per address per 10 minutes, then 5 not_found per profile.
create function api.join_room(
  p_code text,
  p_ref uuid default null,
  p_via text default null,
  p_link_opened_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_member_id uuid;
  v_ip text;
  v_seats integer;
  v_account_id uuid;
  v_via public.join_via;
  v_link_at timestamptz;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  -- An unknown via raises before any limit counts (22023); no via stores null.
  if p_via is not null then
    begin
      v_via := p_via::public.join_via;
    exception when invalid_text_representation then
      raise exception 'unknown via' using errcode = '22023';
    end;
  end if;

  if not internal.rate_limit('join:p:' || v_profile.id, 10, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- Per address (gap 7): 30 attempts per 10 minutes, which a party on one Wi-Fi never reaches.
  -- No address (the server, the SQL editor): only the per-profile limits apply.
  v_ip := internal.request_ip_key();
  if v_ip is not null and not internal.rate_limit('join:ip:' || v_ip, 30, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- Failed attempts count more: peek here, count only a not_found below.
  if not internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes', false) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_room from public.rooms
  where code = p_code and state in ('lobby', 'dealing', 'swiping', 'finale')
  for no key update;
  -- A link for a room that has ended (or whose code another room now holds): closed,
  -- counted as a failed attempt like not_found.
  if p_ref is not null and (not found or v_room.id <> p_ref) then
    perform internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes');
    return jsonb_build_object('status', 'closed');
  end if;
  if not found then
    perform internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes');
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Fresh Letterboxd data for tonight: sync if the last one is over 6 hours old.
  update public.profiles set last_seen_at = now() where id = v_profile.id;
  for v_account_id in
    update public.linked_accounts la
    set sync_requested_at = now()
    where la.profile_id = v_profile.id
      and (la.last_synced_at is null or la.last_synced_at < now() - interval '6 hours')
      and (la.sync_requested_at is null or la.sync_requested_at < now() - interval '10 minutes')
    returning la.id
  loop
    perform internal.enqueue('letterboxd_sync', jsonb_build_object(
      'linked_account_id', v_account_id, 'reason', 'joined_room'));
  end loop;

  -- Rejoin after a dropped connection or an app restart: same seat.
  select id into v_member_id from public.room_members
  where room_id = v_room.id and profile_id = v_profile.id;
  if found then
    update public.room_members set left_at = null, last_active_at = now() where id = v_member_id;
    return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                              'state', v_room.state, 'rejoined', true);
  end if;

  if v_room.state = 'dealing' then
    return jsonb_build_object('status', 'starting');    -- try again in a second
  end if;
  if v_room.state = 'finale' then
    return jsonb_build_object('status', 'in_finale');
  end if;
  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required', 'host_name',
      (select m.display_name from public.room_members m where m.room_id = v_room.id and m.role = 'host' limit 1));
  end if;

  select count(*) into v_seats from public.room_members where room_id = v_room.id and left_at is null;
  if v_seats >= v_room.max_players then
    return jsonb_build_object('status', 'full', 'max_players', v_room.max_players);
  end if;

  -- Only a link has an opening time, between the room's creation and now.
  if v_via = 'link' and p_link_opened_at is not null then
    v_link_at := least(greatest(p_link_opened_at, v_room.created_at), now());
  end if;

  insert into public.room_members (room_id, profile_id, controlled_by, display_name, avatar_key, provider_ids,
                                   joined_via, link_opened_at)
  values (
    v_room.id, v_profile.id, v_profile.id, v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}'),
    v_via, v_link_at
  )
  returning id into v_member_id;

  -- Late joiner: deal them the shared opening now, and the rest from the
  -- server, or under deck_engine 'sql' from the baseline below.
  if v_room.state = 'swiping' then
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score)
    select distinct on (d.title_id) d.room_id, v_member_id, d.title_id, d.sort_key, 'opening', d.score
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id
    where d.room_id = v_room.id and d.source = 'opening' and c.state = 'active';
    if internal.deck_engine() <> 'sql' then
      update public.room_members set refill_requested_at = now() where id = v_member_id;
      perform internal.enqueue('deck_requests', jsonb_build_object(
        'kind', 'refill', 'room_id', v_room.id, 'room_member_id', v_member_id));
    end if;
  end if;

  perform internal.refresh_room_providers(v_room.id);
  -- After the refresh, so the baseline sees the joiner's services, as the server would.
  if v_room.state = 'swiping' and internal.deck_engine() = 'sql' then
    perform internal.deal_baseline(v_room.id, v_member_id);
  end if;
  perform internal.broadcast_room(v_room.id, 'member_joined', jsonb_build_object(
    'member_id', v_member_id, 'display_name', v_profile.display_name, 'avatar_key', v_profile.avatar_key));

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                            'state', v_room.state, 'rejoined', false);
end
$$;

grant execute on function api.join_room(text, uuid, text, timestamptz) to authenticated;

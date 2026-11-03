-- M4.23: the host can lock the room. rooms.locked, api.set_room_locked, the locked answer in
-- join_room and room_preview, locked on api.rooms, the room_locked event. A player who rejoins
-- a room with no host seat takes the host role (Q23.3).
-- (security.md#room-codes-joining-and-the-host, data-model.md#leaving-and-coming-back)

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.rooms add column if not exists locked boolean not null default false;

create or replace view api.rooms with (security_invoker = true) as
  select r.id, r.code, r.mode, r.state, r.country, r.service_rule, r.offer_kinds, r.runtime_max,
         r.seen_rule, r.quality, r.max_age, r.reveal, r.max_players, r.provider_ids, r.stats,
         r.created_at, r.started_at, r.finale_at, r.decided_at, r.ended_at, r.locked
  from public.rooms r;

create function api.set_room_locked(p_room_id uuid, p_locked boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  if p_room_id is null or p_locked is null then
    raise exception 'room and locked are required' using errcode = '22023';
  end if;

  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found or not exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.role = 'host' and m.left_at is null
      and m.profile_id = internal.my_profile_id()
  ) then
    raise exception 'only the host can lock the room' using errcode = '42501';
  end if;

  if v_room.state in ('done', 'abandoned') then
    return jsonb_build_object('status', 'closed');
  end if;

  if v_room.locked is distinct from p_locked then
    update public.rooms set locked = p_locked where id = p_room_id;
    perform internal.broadcast_room(p_room_id, 'room_locked', jsonb_build_object('locked', p_locked));
  end if;

  return jsonb_build_object('status', 'ok', 'locked', p_locked);
end
$$;

grant execute on function api.set_room_locked(uuid, boolean) to authenticated;

-- join_room: locked comes after the rejoin (a seated player gets back in, and takes the host
-- role if nobody holds it) and before starting, in_finale, name_required and full.
create or replace function api.join_room(
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

  -- Removed by the host: no way back, by code or by link. Not a failed attempt, and
  -- nothing is written (no sync request, no last_seen_at, no rejoin).
  if exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is not null
  ) then
    return jsonb_build_object('status', 'removed');
  end if;

  -- Locked by the host: no new seats, by code or by link. A seat that exists (one that left)
  -- still gets back in below. Not a failed attempt, and nothing is written.
  if v_room.locked and not exists (
    select 1 from public.room_members where room_id = v_room.id and profile_id = v_profile.id
  ) then
    return jsonb_build_object('status', 'locked');
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
    -- No seat holds the host role (the host left and nobody took over): this player does,
    -- so the room can be unlocked and started. Nobody else is seated, so no broadcast (Q23.3).
    if not exists (
      select 1 from public.room_members
      where room_id = v_room.id and role = 'host' and left_at is null
    ) then
      update public.room_members set role = 'host' where id = v_member_id;
      update public.rooms set host_id = v_profile.id where id = v_room.id;
    end if;
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

-- room_preview: locked is for callers with no seat, after removed, before in_finale and full.
create or replace function api.room_preview(p_code text, p_ref uuid) returns jsonb
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

  if exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is not null
  ) then
    return jsonb_build_object('status', 'removed');
  end if;

  select count(*) into v_players from public.room_members
  where room_id = v_room.id and left_at is null;
  select exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is null
  ) into v_seated;

  -- A seated caller goes straight back in, whatever the state or count (as join_room's rejoin).
  if not v_seated then
    if v_room.locked then
      return jsonb_build_object('status', 'locked');
    end if;
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

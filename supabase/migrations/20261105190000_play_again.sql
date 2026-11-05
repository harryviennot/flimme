-- M6.22: api.play_again and the next_room event (game-modes.md#apiplay_againroom). The host of a
-- done or abandoned room opens the next one with the same settings and the host's own seat
-- moods; the other phones learn its code from next_room on the old room's topic, or from
-- api.rooms (next_room_id, next_room_code) when they missed the event. Decided 5 Nov 2026 (Q22.1
-- to Q22.7). Replaces the view api.rooms (from 20261103190000_lock_room.sql, two columns
-- appended) and internal.write_room_stats (from 20261105120000_shortlist.sql, next_room_id added).

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.rooms
  add column if not exists next_room_id uuid references public.rooms on delete set null;

-- The code of the room's next room while that room is still open, else null. The caller is not a
-- member of the next room, so the view cannot read it with their own rights. Only seats of the
-- old room (and not removed ones) get a code.
create function internal.next_room_code(p_room_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select n.code::text
  from public.rooms o
  join public.rooms n on n.id = o.next_room_id
  where o.id = p_room_id
    and n.state in ('lobby', 'dealing', 'swiping', 'finale')
    and internal.is_room_member(p_room_id)
$$;

revoke all on function internal.next_room_code(uuid) from public, anon;
grant execute on function internal.next_room_code(uuid) to authenticated;

create or replace view api.rooms with (security_invoker = true) as
  select r.id, r.code, r.mode, r.state, r.country, r.service_rule, r.offer_kinds, r.runtime_max,
         r.seen_rule, r.quality, r.max_age, r.reveal, r.max_players, r.provider_ids, r.stats,
         r.created_at, r.started_at, r.finale_at, r.decided_at, r.ended_at, r.locked,
         r.next_room_id, internal.next_room_code(r.id) as next_room_code
  from public.rooms r;

-- write_room_stats, whole, with next_room_id copied from the column (Q22.5).
create or replace function internal.write_room_stats(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_pick public.matches;
  v_median double precision;
  v_players integer;
  v_matches integer;
  v_stats jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found or v_room.state not in ('done', 'abandoned') then
    return null;
  end if;

  select * into v_pick from public.matches where room_id = p_room_id and pick_order = 1;
  select count(*) into v_matches from public.matches where room_id = p_room_id and matched_at is not null;

  select percentile_cont(0.5) within group (order by m.swipe_count), count(*)
  into v_median, v_players
  from public.room_members m
  where m.room_id = p_room_id and m.swipe_count > 0;

  v_stats := jsonb_build_object(
    'outcome', case
      when v_room.state = 'abandoned' then 'abandoned'
      when v_pick.room_id is null then 'no_pick'
      when v_pick.kind = 'finale' then 'finale'
      else 'match' end,
    'seconds_to_pick', case when v_pick.room_id is not null
      then round(extract(epoch from v_room.decided_at - v_room.started_at))::integer end,
    'present_at_pick', v_pick.present_count,
    'swipes_per_seat', v_median,
    'players', v_players,
    'finale_reason', v_room.finale_reason,
    'matches', v_matches,
    'next_room_id', v_room.next_room_id);

  update public.rooms set stats = v_stats where id = p_room_id;
  return v_stats;
end
$$;

-- The host of a finished room opens the next one. Answers: ok {room_id, code}, not_finished,
-- unknown_mode (a solo room), name_required. Raises 42501 for anyone but a present host seat.
create function api.play_again(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_host public.room_members;
  v_next public.rooms;
  v_new public.rooms;
  v_active boolean;
  i integer;
begin
  if p_room_id is null then
    raise exception 'room is required' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    raise exception 'only the host can play again' using errcode = '42501';
  end if;

  select * into v_host from public.room_members m
  where m.room_id = p_room_id and m.role = 'host' and m.profile_id = v_profile.id
    and m.left_at is null and m.removed_at is null;
  if not found then
    raise exception 'only the host can play again' using errcode = '42501';
  end if;

  if v_room.state not in ('done', 'abandoned') then
    return jsonb_build_object('status', 'not_finished');
  end if;

  -- A repeat call: the open next room is returned and the event goes out again (Q22.3).
  if v_room.next_room_id is not null then
    select * into v_next from public.rooms where id = v_room.next_room_id;
    if found and v_next.state in ('lobby', 'dealing', 'swiping', 'finale') then
      perform internal.broadcast_room(p_room_id, 'next_room', jsonb_build_object(
        'room_id', v_next.id, 'code', v_next.code, 'host_member_id', v_host.id));
      return jsonb_build_object('status', 'ok', 'room_id', v_next.id, 'code', v_next.code);
    end if;
  end if;

  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required');
  end if;

  select g.is_active into v_active from public.game_modes g where g.slug = v_room.mode;
  if not coalesce(v_active, false) then
    return jsonb_build_object('status', 'unknown_mode');
  end if;

  for i in 1..10 loop
    begin
      insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, quality,
                                service_rule, reveal, runtime_max, max_age, offer_kinds,
                                include_free_services, locked)
      values (
        internal.new_room_code(), v_profile.id, v_room.mode, v_room.country, v_room.max_players,
        v_room.seen_rule, v_room.quality, v_room.service_rule, v_room.reveal, v_room.runtime_max,
        v_room.max_age, v_room.offer_kinds, v_room.include_free_services, false
      )
      returning * into v_new;
      exit;
    exception when unique_violation then
      if i = 10 then raise; end if;
    end;
  end loop;

  insert into public.room_members (room_id, profile_id, controlled_by, role, display_name,
                                   avatar_key, provider_ids, mood_slugs)
  values (
    v_new.id, v_profile.id, v_profile.id, 'host', v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp
              where pp.profile_id = v_profile.id), '{}'),
    v_host.mood_slugs
  );
  insert into public.room_models (room_id) values (v_new.id);
  perform internal.refresh_room_providers(v_new.id);

  update public.rooms set next_room_id = v_new.id where id = p_room_id;
  if v_room.stats is not null then
    update public.rooms
    set stats = stats || jsonb_build_object('next_room_id', v_new.id)
    where id = p_room_id;
  end if;

  perform internal.broadcast_room(p_room_id, 'next_room', jsonb_build_object(
    'room_id', v_new.id, 'code', v_new.code, 'host_member_id', v_host.id));

  return jsonb_build_object('status', 'ok', 'room_id', v_new.id, 'code', v_new.code);
end
$$;

revoke execute on function api.play_again(uuid) from public, anon;
grant execute on function api.play_again(uuid) to authenticated;

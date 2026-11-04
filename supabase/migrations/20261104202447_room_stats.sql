-- M6.8: the end of a room on the server. internal.write_room_stats computes rooms.stats from what
-- the database holds (analytics.md#changes-this-asks-elsewhere, game-modes.md#how-a-game-ends):
-- counts and timings only, never a name. The server's room_finished handler calls it, so a message
-- that arrives twice writes the same numbers twice. internal.on_room_state also queues
-- room_finished for a room abandoned after the start. The migration queues the rooms that ended
-- before it.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Computes and overwrites rooms.stats for a room that has ended, and returns it. A room still in
-- play (lobby, dealing, swiping, finale) is skipped: null, nothing written.
-- outcome: match (pick_order 1 of kind unanimous or majority), finale (kind finale), no_pick (done
-- without a pick), abandoned. swipes_per_seat is the median swipe_count over the seats that swiped
-- at least once, players their number.
create function internal.write_room_stats(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_pick public.matches;
  v_median double precision;
  v_players integer;
  v_stats jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found or v_room.state not in ('done', 'abandoned') then
    return null;
  end if;

  select * into v_pick from public.matches where room_id = p_room_id and pick_order = 1;

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
    'finale_reason', v_room.finale_reason);

  update public.rooms set stats = v_stats where id = p_room_id;
  return v_stats;
end
$$;

grant execute on function internal.write_room_stats(uuid) to app_server;

-- One room_finished message per room that ended without stats: done, or abandoned after the start.
-- Returns how many it queued. No grant: only this migration and the tests call it.
create function internal.requeue_room_stats() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select r.id from public.rooms r
    where r.stats is null
      and (r.state = 'done' or (r.state = 'abandoned' and r.started_at is not null))
  loop
    perform internal.enqueue('room_finished', jsonb_build_object('room_id', v_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- Every way a room can end passes through here. A lobby abandoned before the start has nothing to
-- record; a room abandoned after it does.
create or replace function internal.on_room_state() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.state = 'done' or (new.state = 'abandoned' and new.started_at is not null) then
    perform internal.enqueue('room_finished', jsonb_build_object('room_id', new.id));
  end if;
  return null;
end
$$;

select internal.requeue_room_stats();

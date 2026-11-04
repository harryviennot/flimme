-- M6.7: starting to swipe moves rooms.expires_at to 1 hour after the start
-- (game-modes.md#how-a-game-ends). Replaces internal.begin_swiping whole from the
-- baseline (this is now the current definition); the only change is expires_at in the update. A lobby keeps its 3-hour
-- expiry until the game starts.
set local lock_timeout = '3s';
set local statement_timeout = '10s';

create or replace function internal.begin_swiping(p_room_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
begin
  select mode into v_mode from public.rooms where id = p_room_id and state = 'dealing' for no key update;
  if not found then
    raise exception 'room is not being dealt' using errcode = '22023';
  end if;
  update public.rooms
  set state = 'swiping',
      started_at = now(),
      expires_at = now() + interval '1 hour',
      rule = (
        select jsonb_agg(to_jsonb(mr) - 'id' - 'mode' order by mr.min_players)
        from public.match_rules mr where mr.mode = v_mode
      )
  where id = p_room_id;
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'swiping'));
end
$$;

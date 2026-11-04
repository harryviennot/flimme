-- M6.6 follow-up (Harry, 4 Nov 2026): a player who taps Leave counts like a dropped connection for
-- the "fewer than 2 present for 5 minutes" rule, so a room left with one player waits 5 minutes and the
-- lone player can still bring someone in by code. A seat stops being present 90 seconds after it was
-- last heard from, or the moment it leaves. Replaced whole (from 20261104215514): internal.sweep_room,
-- same signature, no api change, no _v2.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- One room's checks, at most one action per run, in this order: close an expired round; abandon
-- (fewer than two heard from, or the one-hour limit with nothing liked); the one-hour finale; the
-- room's own finale rules; the everyone-done ending with no pick. Answers what it did: abandoned,
-- host_changed, dealt, finale, no_pick, closed_round, locked (another transaction holds the room,
-- the next run gets it) or nothing.
create or replace function internal.sweep_room(p_room_id uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_host public.room_members;
  v_next uuid;
  v_round public.rounds;
  v_present uuid[];
  v_liked integer;
  v_state public.room_state;
begin
  select r.* into v_room from public.rooms r
  where r.id = p_room_id and r.state in ('lobby', 'dealing', 'swiping', 'finale')
  for no key update skip locked;
  if not found then
    if exists (select 1 from public.rooms r
               where r.id = p_room_id and r.state in ('lobby', 'dealing', 'swiping', 'finale')) then
      return 'locked';
    end if;
    return 'nothing';
  end if;

  if v_room.state in ('lobby', 'dealing') then
    if now() > v_room.expires_at then
      perform internal.abandon_room(p_room_id);
      return 'abandoned';
    end if;

    if v_room.state = 'lobby' then
      -- A silent host hands the role over by the same rule as leaving.
      select m.* into v_host from public.room_members m
      where m.room_id = p_room_id and m.role = 'host' and m.left_at is null and m.removed_at is null;
      if found and v_host.last_active_at < now() - interval '2 minutes' then
        v_next := internal.next_host_member(p_room_id);
        if v_next is not null and v_next <> v_host.id then
          update public.room_members set role = 'guest' where id = v_host.id;
          update public.room_members set role = 'host' where id = v_next;
          update public.rooms set host_id = (select m.profile_id from public.room_members m where m.id = v_next)
          where id = p_room_id;
          perform internal.broadcast_room(p_room_id, 'host_changed', jsonb_build_object('member_id', v_next));
          return 'host_changed';
        end if;
      end if;
    elsif now() - v_room.dealing_at > interval '20 seconds' then
      -- The host's phone never retried: deal the SQL baseline (it moves the room on and broadcasts).
      perform internal.deal_baseline(p_room_id);
      return 'dealt';
    end if;
    return 'nothing';
  end if;

  if v_room.state = 'finale' then
    select ro.* into v_round from public.rounds ro
    where ro.room_id = p_room_id and ro.stage <> 'closed'
    order by ro.seq desc limit 1;
    if found then
      -- A live round is never abandoned; a round no phone closed is closed two seconds after its end.
      if now() > v_round.stage_closes_at + interval '2 seconds' then
        perform internal.close_round_stage(v_round.id);
        return 'closed_round';
      end if;
      return 'nothing';
    end if;
    -- A finale with no open round is a broken room: it ends at the one-hour limit.
    if now() > v_room.expires_at then
      perform internal.abandon_room(p_room_id);
      return 'abandoned';
    end if;
    return 'nothing';
  end if;

  -- Swiping. Fewer than two seats present for five minutes means nobody is playing. A seat stops
  -- being present 90 seconds after it was last heard from, or the moment it leaves (Harry, 4 Nov
  -- 2026: a lone player who tapped Leave waits the same five minutes as a dropped connection).
  v_liked := internal.liked_count(p_room_id);
  if (select count(*) from public.room_members m
      where m.room_id = p_room_id and m.removed_at is null
        and coalesce(m.left_at, m.last_active_at + interval '90 seconds') > now() - interval '5 minutes') < 2
     or (now() > v_room.expires_at and v_liked = 0) then
    perform internal.abandon_room(p_room_id);
    return 'abandoned';
  end if;

  v_present := internal.present_member_ids(p_room_id);
  if now() > v_room.expires_at then
    perform internal.start_finale(p_room_id, internal.pick_rule(v_room.rule, cardinality(v_present)), 'time');
    return 'finale';
  end if;

  -- The room's own rules: the card count, the time limit, everyone done with a like.
  perform internal.maybe_start_finale(p_room_id);
  select r.state into v_state from public.rooms r where r.id = p_room_id;
  if v_state = 'finale' then
    return 'finale';
  elsif v_state = 'done' then
    return case when exists (select 1 from public.matches x where x.room_id = p_room_id)
                then 'finale' else 'no_pick' end;
  end if;

  -- Everyone present is done and nothing was liked: after five minutes the night ends with no pick.
  if cardinality(v_present) > 0 and v_liked = 0
     and not exists (select 1 from public.room_members m where m.id = any (v_present) and m.done_at is null)
     and (select max(m.done_at) from public.room_members m where m.id = any (v_present))
         <= now() - interval '5 minutes' then
    update public.rooms set state = 'done', ended_at = now(), finale_reason = 'all_done' where id = p_room_id;
    perform internal.broadcast_room(p_room_id, 'state_changed',
      jsonb_build_object('state', 'done', 'outcome', 'no_pick'));
    return 'no_pick';
  end if;
  return 'nothing';
end
$$;

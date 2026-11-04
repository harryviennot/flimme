-- M6.30: the 3-minute silence (game-modes.md#who-counts-presence-joining-and-leaving).
-- A seat silent for 90 seconds stops being present (the card count, everyone done, ballots, the near
-- miss's "someone left to answer"), but it only stops being a voter after 3 minutes, so someone
-- answering a message never comes back to a room decided without them. The minute sweeper then
-- re-checks liked films once for each silence. Replaced whole: internal.check_card_match (from
-- 20261104090001, which also sends state_changed when a match ends the room, Q30.1) and
-- internal.sweep_room (from 20261104223416). No api change, no _v2.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- When the sweeper last re-checked liked films because of this seat's silence. Not in api.room_seats.
alter table public.room_members add column if not exists silence_checked_at timestamptz;

-- Who votes: seats not left and heard from in the last 3 minutes.
create function internal.voter_member_ids(p_room_id uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.id), '{}')
  from public.room_members m
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_active_at > now() - interval '3 minutes'
$$;
revoke all on function internal.voter_member_ids(uuid) from public, anon, authenticated;

-- Applies the room's rule to one card. The caller holds the room lock.
-- Every voter (heard from in the last 3 minutes) counts and only likes help ("Seen it" no longer abstains).
-- seen_rewatch is a like. The no-match answer says how many likes the rule needs.
create or replace function internal.check_card_match(p_room_id uuid, p_title_id bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_voter_ids uuid[];
  v_rule jsonb;
  v_likes integer;
  v_voters integer;
  v_needed integer;
  v_matched boolean;
  v_kind public.match_kind;
  v_decided boolean := false;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if (select c.state from public.room_cards c where c.room_id = p_room_id and c.title_id = p_title_id) <> 'active' then
    return null;
  end if;

  v_voter_ids := internal.voter_member_ids(p_room_id);
  v_rule := internal.pick_rule(v_room.rule, cardinality(v_voter_ids));

  select count(*) filter (where v.answer in ('like', 'super_like', 'seen_rewatch'))
  into v_likes
  from public.votes v
  where v.room_id = p_room_id and v.title_id = p_title_id and v.room_member_id = any (v_voter_ids);

  v_voters := cardinality(v_voter_ids);
  v_needed := internal.likes_needed(v_rule, v_voters);
  v_matched := v_voters >= 2 and v_needed is not null and v_likes >= v_needed;
  if not v_matched then
    return jsonb_build_object('match', false, 'likes', v_likes, 'of', v_voters, 'needed', v_needed);
  end if;

  v_kind := case when v_likes >= v_voters then 'unanimous' else 'majority' end;
  update public.room_cards set state = 'matched' where room_id = p_room_id and title_id = p_title_id;
  insert into public.matches (room_id, title_id, kind, like_count, present_count)
  values (p_room_id, p_title_id, v_kind, v_likes, v_voters);

  if v_room.state = 'swiping'
     and (select gm.ends_on_first_match from public.game_modes gm where gm.slug = v_room.mode) then
    update public.matches set pick_order = 1 where room_id = p_room_id and title_id = p_title_id;
    update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = p_room_id;
    v_decided := true;
  end if;

  perform internal.broadcast_room(p_room_id, 'match', jsonb_build_object(
    'title_id', p_title_id, 'kind', v_kind, 'likes', v_likes, 'of', v_voters, 'decided', v_decided));
  if v_decided then
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
  end if;
  return jsonb_build_object('match', true, 'kind', v_kind, 'decided', v_decided);
end
$$;

-- One room's checks, at most one action per run, in this order: close an expired round; abandon
-- (fewer than two heard from, or the one-hour limit with nothing liked); the one-hour finale; the
-- room's own finale rules; the everyone-done ending with no pick. Answers what it did: abandoned,
-- host_changed, dealt, finale, no_pick, closed_round, rechecked, locked (another transaction holds the room,
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
  v_silent uuid[];
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

  -- A seat silent for 3 minutes stopped being a voter: re-check the liked films once for it (a match
  -- can now be there). A seat that comes back and goes silent again is re-checked again.
  select coalesce(array_agg(m.id), '{}') into v_silent from public.room_members m
  where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
    and m.last_active_at <= now() - interval '3 minutes'
    and (m.silence_checked_at is null or m.silence_checked_at < m.last_active_at);
  if cardinality(v_silent) > 0 then
    update public.room_members set silence_checked_at = now() where id = any (v_silent);
    perform internal.recheck_room_matches(p_room_id);
    return 'rechecked';
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

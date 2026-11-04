-- M6.6: internal.sweep_rooms, every minute (game-modes.md#internalsweep_rooms). Rooms nobody closes
-- still end: lobbies expire, a silent host hands over, a stuck deal gets the baseline, swiping rooms
-- reach the finale on time without a vote, empty games are abandoned, an unfinished round is closed.
--
-- internal.sweep_room(room) does one room under the room lock (skip locked) and says what it did.
-- internal.sweep_rooms() is the procedure cron calls: it loops over the live rooms in batches of 100
-- and commits after each room. It is a plain procedure (security invoker, no SET clause) because
-- Postgres refuses COMMIT inside a security definer procedure or one with a SET clause. Cron runs it
-- as the database owner; it is revoked from everyone else and every name in it is schema-qualified.
-- Also replaced whole (from 20261104202720): internal.close_round_stage, which now does nothing for a
-- room that is no longer in the finale (M6.5 note). Same signature, no api change, no _v2.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Closes a round: vetoes, points, ties, then the pick. The caller holds the room lock and has
-- decided that it is time. Safe to run twice: a closed round, or a room outside the finale, answers 'closed'.
create or replace function internal.close_round_stage(p_round_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_round public.rounds;
  v_ballots integer;
  v_unvetoed integer;
  v_in bigint[];
  v_winner bigint;
  v_reason text;
  v_present integer;
  v_card public.room_cards;
  v_finalists jsonb;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'round not found' using errcode = '42501';
  end if;
  if v_round.stage = 'closed' then
    return jsonb_build_object('status', 'closed', 'winner_title_id', v_round.winner_title_id);
  end if;
  -- A room that is no longer in the finale (abandoned by the sweeper, say) has nothing to close.
  if not exists (select 1 from public.rooms r where r.id = v_round.room_id and r.state = 'finale') then
    return jsonb_build_object('status', 'closed', 'winner_title_id', v_round.winner_title_id);
  end if;

  select count(distinct b.room_member_id) into v_ballots
  from public.round_ballots b where b.round_id = p_round_id;

  -- Step 1, the vetoes: films with no veto stay in; with exactly one it wins; with none the two
  -- with the fewest vetoes stay in (ties to the better seed).
  select count(*), array_agg(c.title_id order by c.seed) into v_unvetoed, v_in
  from public.round_candidates c
  where c.round_id = p_round_id
    and not exists (select 1 from public.round_ballots b
                    where b.round_id = p_round_id and b.kind = 'veto' and b.title_id = c.title_id);
  if v_unvetoed = 0 then
    select array_agg(x.title_id order by x.n, x.seed) into v_in
    from (
      select c.title_id, c.seed,
             (select count(*) from public.round_ballots b
              where b.round_id = p_round_id and b.kind = 'veto' and b.title_id = c.title_id) as n
      from public.round_candidates c where c.round_id = p_round_id
      order by 3, c.seed limit 2) x;
  end if;

  -- vetoed_at marks only the knocked-out films; vetoed_by (stored, never sent) the first seat that vetoed it.
  update public.round_candidates c
  set vetoed_at = now(),
      vetoed_by = (select b.room_member_id from public.round_ballots b
                   where b.round_id = p_round_id and b.kind = 'veto' and b.title_id = c.title_id
                   order by b.id limit 1)
  where c.round_id = p_round_id and not (c.title_id = any (v_in));

  -- Step 2, the points: each ballot read over the films still in; the first gets as many points as
  -- there are films in, down to 1. A film still in that the ballot vetoed comes last (1 point).
  update public.round_candidates c
  set points = s.pts
  from (
    select t.title_id, sum(t.pts)::real as pts
    from (
      select o.title_id, cardinality(v_in) - o.pos + 1 as pts
      from (
        select b.title_id, row_number() over (partition by b.room_member_id order by b.rank) as pos
        from public.round_ballots b
        where b.round_id = p_round_id and b.kind = 'rank' and b.title_id = any (v_in)) o
      union all
      select b.title_id, 1
      from public.round_ballots b
      where b.round_id = p_round_id and b.kind = 'veto' and b.title_id = any (v_in)) t
    group by t.title_id) s
  where c.round_id = p_round_id and c.title_id = s.title_id;

  -- Steps 3 and 4: the winner.
  if v_ballots = 0 then
    v_reason := 'no_ballots';
    select c.title_id into v_winner from public.round_candidates c
    where c.round_id = p_round_id and c.title_id = any (v_in)
    order by c.seed limit 1;
  else
    v_reason := case when v_unvetoed = 1 then 'only_unvetoed' else 'points' end;
    select c.title_id into v_winner
    from public.round_candidates c
    join public.room_cards k on k.room_id = v_round.room_id and k.title_id = c.title_id
    where c.round_id = p_round_id and c.title_id = any (v_in)
    order by c.points desc, k.super_like_count desc, k.like_count desc, k.group_score desc, c.seed
    limit 1;
  end if;

  v_present := cardinality(internal.present_member_ids(v_round.room_id));
  select * into v_card from public.room_cards k where k.room_id = v_round.room_id and k.title_id = v_winner;

  update public.rounds
  set stage = 'closed', closed_at = now(), winner_title_id = v_winner
  where id = p_round_id;

  insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
  values (v_round.room_id, v_winner, 'finale', v_card.like_count + v_card.super_like_count, v_present, 1)
  on conflict (room_id, title_id) do update
    set kind = 'finale', pick_order = 1,
        like_count = excluded.like_count, present_count = excluded.present_count;
  update public.room_cards set state = 'matched' where room_id = v_round.room_id and title_id = v_winner;
  update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = v_round.room_id;

  select jsonb_agg(jsonb_build_object(
           'title_id', c.title_id, 'seed', c.seed, 'points', c.points, 'vetoed', c.vetoed_at is not null)
         order by c.seed)
  into v_finalists from public.round_candidates c where c.round_id = p_round_id;

  perform internal.broadcast_room(v_round.room_id, 'match', jsonb_build_object(
    'title_id', v_winner, 'kind', 'finale', 'decided', true,
    'likes', v_card.like_count + v_card.super_like_count, 'of', v_present,
    'reason', v_reason, 'finalists', v_finalists));
  perform internal.broadcast_room(v_round.room_id, 'state_changed', jsonb_build_object('state', 'done'));
  return jsonb_build_object('status', 'ok', 'winner_title_id', v_winner);
end
$$;

-- Ends a room nobody is playing in. The caller holds the room lock. Rooms that had started queue
-- room_finished through the state trigger (M6.8).
create function internal.abandon_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.rooms set state = 'abandoned', ended_at = now() where id = p_room_id;
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'abandoned'));
end
$$;

-- One room's checks, at most one action per run, in this order: close an expired round; abandon
-- (fewer than two heard from, or the one-hour limit with nothing liked); the one-hour finale; the
-- room's own finale rules; the everyone-done ending with no pick. Answers what it did: abandoned,
-- host_changed, dealt, finale, no_pick, closed_round, locked (another transaction holds the room,
-- the next run gets it) or nothing.
create function internal.sweep_room(p_room_id uuid) returns text
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

-- The cron job's entry point: every live room, a batch of 100 at a time in sweep order, each in its
-- own transaction. A room that fails is logged by id and the rest go on.
create procedure internal.sweep_rooms()
language plpgsql
as $$
declare
  v_row record;
  v_n integer;
  v_last_expires timestamptz := '-infinity';
  v_last_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  loop
    v_n := 0;
    for v_row in
      select r.id, r.expires_at from public.rooms r
      where r.state in ('lobby', 'dealing', 'swiping', 'finale')
        and (r.expires_at, r.id) > (v_last_expires, v_last_id)
      order by r.expires_at, r.id
      limit 100
    loop
      begin
        -- Transaction-local, so the commit below resets it: a room whose rows are busy waits at most
        -- two seconds, is logged and comes round next minute.
        perform set_config('lock_timeout', '2s', true);
        perform internal.sweep_room(v_row.id);
      exception when others then
        raise warning 'sweep_rooms: room % failed: %', v_row.id, sqlerrm;
      end;
      v_last_expires := v_row.expires_at;
      v_last_id := v_row.id;
      v_n := v_n + 1;
      commit;
    end loop;
    exit when v_n < 100;
  end loop;
end
$$;

revoke all on function internal.abandon_room(uuid) from public, anon, authenticated;
revoke all on function internal.sweep_room(uuid) from public, anon, authenticated;
revoke all on procedure internal.sweep_rooms() from public, anon, authenticated;

-- Named, so running this file twice replaces the job instead of adding another.
select cron.schedule('sweep_rooms', '* * * * *', $$call internal.sweep_rooms()$$);

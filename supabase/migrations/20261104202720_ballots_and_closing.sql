-- M6.5: the whole Final Cut ballot in one call, closing a round, and the counting and tie rules
-- (game-modes.md#functions-still-to-write, #counting). New: api.cast_ballot, api.close_round_stage,
-- api.round_progress, internal.close_round_stage, internal.round_lock_state. Replaced in place:
-- the view api.room_seats (same columns and types; other seats' vetoes_left and super_likes_left
-- are null, so a spent veto never shows who vetoed).

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace view api.room_seats with (security_invoker = true) as
  select m.id as member_id, m.room_id, m.role, m.display_name, m.avatar_key, m.provider_ids,
         m.joined_at, m.left_at, m.calibrated_at, m.done_at, m.swipe_count,
         case when m.controlled_by in (select internal.my_profile_ids()) then m.super_likes_left end as super_likes_left,
         case when m.controlled_by in (select internal.my_profile_ids()) then m.vetoes_left end as vetoes_left,
         m.profile_id is not distinct from internal.my_profile_id() as is_me,
         m.controlled_by in (select internal.my_profile_ids()) as is_mine
  from public.room_members m;

-- Who has locked in and how many seats are present (never what they voted).
create function internal.round_lock_state(p_round_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'locked', to_jsonb(array(
      select distinct b.room_member_id from public.round_ballots b where b.round_id = r.id)),
    'of', cardinality(internal.present_member_ids(r.room_id)),
    -- Every present seat has locked in, and there is at least one present seat.
    'all_locked', cardinality(internal.present_member_ids(r.room_id)) > 0
      and not exists (
        select 1 from unnest(internal.present_member_ids(r.room_id)) p(id)
        where not exists (select 1 from public.round_ballots b where b.round_id = r.id and b.room_member_id = p.id)))
  from public.rounds r
  where r.id = p_round_id
$$;

-- Closes a round: vetoes, points, ties, then the pick. The caller holds the room lock and has
-- decided that it is time. Safe to run twice: a closed round answers 'closed'.
create function internal.close_round_stage(p_round_id uuid) returns jsonb
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

create function api.cast_ballot(
  p_round_id uuid,
  p_ranking bigint[],
  p_veto bigint default null,
  p_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_round public.rounds;
  v_room public.rooms;
  v_member public.room_members;
  v_films bigint[];
  v_expected bigint[];
  v_state jsonb;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'round not found' using errcode = '42501';
  end if;
  select * into v_room from public.rooms where id = v_round.room_id for no key update;
  select * into v_round from public.rounds where id = p_round_id;

  select m.* into v_member from public.room_members m
  where m.room_id = v_round.room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()));
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if v_member.left_at is not null or v_member.removed_at is not null then
    return jsonb_build_object('status', 'not_in_room');
  end if;

  -- Two seconds of grace after the stage end, so a ballot sent at zero always counts.
  if v_round.stage = 'closed' or v_room.state <> 'finale'
     or now() > v_round.stage_closes_at + interval '2 seconds' then
    return jsonb_build_object('status', 'closed');
  end if;
  if exists (select 1 from public.round_ballots b
             where b.round_id = p_round_id and b.room_member_id = v_member.id) then
    return jsonb_build_object('status', 'already_voted');
  end if;
  if p_veto is not null and (v_round.kind = 'ranked_vote' or v_member.vetoes_left <= 0) then
    return jsonb_build_object('status', 'no_veto');
  end if;

  select array_agg(c.title_id order by c.seed) into v_films
  from public.round_candidates c where c.round_id = p_round_id;
  if p_ranking is null or (p_veto is not null and not (p_veto = any (v_films)))
     or exists (select 1 from unnest(p_ranking) x where x is null) then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(array_agg(f), '{}') into v_expected from unnest(v_films) f where f is distinct from p_veto;
  if cardinality(p_ranking) <> cardinality(v_expected)
     or (select count(distinct x) from unnest(p_ranking) x) <> cardinality(p_ranking)
     or exists (select 1 from unnest(p_ranking) x where not (x = any (v_expected))) then
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.round_ballots (round_id, room_member_id, kind, title_id, rank)
  select p_round_id, v_member.id, 'rank', u.t, u.o::smallint from unnest(p_ranking) with ordinality as u(t, o);
  insert into public.round_ballots (round_id, room_member_id, kind, title_id)
  values (p_round_id, v_member.id, case when p_veto is null then 'pass' else 'veto' end::public.ballot_kind, p_veto);
  update public.room_members
  set vetoes_left = vetoes_left - (p_veto is not null)::int, last_active_at = now()
  where id = v_member.id;

  v_state := internal.round_lock_state(p_round_id);
  perform internal.broadcast_room(v_round.room_id, 'round_progress', jsonb_build_object(
    'round_id', p_round_id, 'locked', v_state->'locked', 'of', v_state->'of'));
  if (v_state->>'all_locked')::boolean then
    perform internal.close_round_stage(p_round_id);
  end if;
  return jsonb_build_object('status', 'ok', 'locked', v_state->'locked', 'of', v_state->'of');
end
$$;

create function api.close_round_stage(p_round_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_round public.rounds;
  v_room public.rooms;
  v_result jsonb;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if not found then
    raise exception 'round not found' using errcode = '42501';
  end if;
  select * into v_room from public.rooms where id = v_round.room_id for no key update;
  select * into v_round from public.rounds where id = p_round_id;
  if not exists (select 1 from public.room_members m
                 where m.room_id = v_round.room_id and m.removed_at is null
                   and m.controlled_by in (select internal.my_profile_ids())) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if v_round.stage = 'closed' then
    return jsonb_build_object('status', 'closed', 'winner_title_id', v_round.winner_title_id);
  end if;
  if now() > v_round.stage_closes_at + interval '2 seconds'
     or (internal.round_lock_state(p_round_id)->>'all_locked')::boolean then
    v_result := internal.close_round_stage(p_round_id);
    return jsonb_build_object('status', 'ok', 'winner_title_id', v_result->'winner_title_id');
  end if;
  return jsonb_build_object('status', 'not_yet', 'closes_at', v_round.stage_closes_at + interval '2 seconds');
end
$$;

create function api.round_progress(p_round_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_round public.rounds;
  v_state jsonb;
begin
  select * into v_round from public.rounds where id = p_round_id;
  if not found or not exists (
    select 1 from public.room_members m
    where m.room_id = v_round.room_id and m.removed_at is null
      and m.controlled_by in (select internal.my_profile_ids())) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  v_state := internal.round_lock_state(p_round_id);
  return jsonb_build_object(
    'status', 'ok', 'stage', v_round.stage, 'closes_at', v_round.stage_closes_at,
    'locked', v_state->'locked', 'of', v_state->'of',
    'me_locked', exists (
      select 1 from public.round_ballots b
      join public.room_members m on m.id = b.room_member_id
      where b.round_id = p_round_id and m.profile_id = internal.my_profile_id()));
end
$$;

grant execute on function api.cast_ballot(uuid, bigint[], bigint, uuid) to authenticated;
grant execute on function api.close_round_stage(uuid) to authenticated;
grant execute on function api.round_progress(uuid) to authenticated;

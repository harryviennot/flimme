-- M6.35: the finale with a shortlist (game-modes.md#the-finalists, #when-it-starts, #how-a-game-ends;
-- decided 5 Nov 2026). Replaces internal.start_finale whole, from 20261105111500_one_seat_each.sql,
-- same signature. With 3 or more matches, or 2 in Quick Match and Date Night, the candidates are the
-- matches only (2 films make a ranked vote with no veto). One match in those modes is the pick, with
-- no vote: the row keeps its kind and the match event says reason only_match. Anything else
-- (no match, or 1 or 2 in Final Cut mode) takes M6.36's path unchanged.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function internal.start_finale(p_room_id uuid, p_rule jsonb, p_reason public.finale_reason)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid;
  v_kind public.finale_kind := (p_rule->>'finale_kind')::public.finale_kind;
  v_size integer := coalesce((p_rule->>'finale_size')::int, 4);
  v_closes timestamptz;
  v_titles bigint[];
  v_presents uuid[] := internal.present_member_ids(p_room_id);
  v_present integer := cardinality(v_presents);
  v_covered uuid[] := '{}';
  v_next bigint;
  v_card public.room_cards;
  v_mode text;
  v_matches bigint[];
  v_match public.matches;
begin
  -- At least one like: without one the night ends with no pick.
  if not exists (
    select 1 from public.room_cards c
    where c.room_id = p_room_id and c.state in ('active', 'matched') and c.like_count + c.super_like_count >= 1
  ) then
    update public.rooms
    set state = 'done', ended_at = now(), finale_reason = p_reason
    where id = p_room_id;
    perform internal.broadcast_room(p_room_id, 'state_changed',
      jsonb_build_object('state', 'done', 'outcome', 'no_pick'));
    return null;
  end if;

  -- The shortlist: the room's matches, most liked first, then group score, then the lowest film id.
  select coalesce(array_agg(m.title_id order by m.like_count + 2 * m.super_like_count desc, m.group_score desc, m.title_id), '{}')
  into v_matches
  from (
    select mt.title_id, c.like_count, c.super_like_count, c.group_score
    from public.matches mt
    join public.room_cards c on c.room_id = mt.room_id and c.title_id = mt.title_id
    where mt.room_id = p_room_id and mt.matched_at is not null
  ) m;
  select r.mode into v_mode from public.rooms r where r.id = p_room_id;

  if cardinality(v_matches) = 1 and v_mode in ('quick_match', 'date_night') then
    -- A single match is the pick: no vote.
    update public.matches set pick_order = 1 where room_id = p_room_id and title_id = v_matches[1]
    returning * into v_match;
    update public.rooms
    set state = 'done', finale_at = now(), decided_at = now(), ended_at = now(), finale_reason = p_reason
    where id = p_room_id;
    perform internal.broadcast_room(p_room_id, 'match', jsonb_build_object(
      'title_id', v_match.title_id, 'kind', v_match.kind, 'decided', true,
      'likes', v_match.like_count, 'of', v_match.present_count, 'reason', 'only_match'));
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
    return null;
  end if;

  if cardinality(v_matches) >= 3 or (cardinality(v_matches) = 2 and v_mode in ('quick_match', 'date_night')) then
    -- A vote between the matches only.
    v_titles := v_matches;
    if cardinality(v_titles) = 2 then
      v_kind := 'ranked_vote';
    end if;
    v_closes := now() + interval '60 seconds';
    insert into public.rounds (room_id, kind, stage, stage_closes_at)
    values (p_room_id, v_kind, 'vote', v_closes)
    returning id into v_round_id;
    insert into public.round_candidates (round_id, title_id, seed)
    select v_round_id, u.t, u.o::smallint from unnest(v_titles) with ordinality as u(t, o);
    update public.rooms set state = 'finale', finale_at = now(), finale_reason = p_reason where id = p_room_id;
    perform internal.broadcast_room(p_room_id, 'finale_started', jsonb_build_object(
      'round_id', v_round_id, 'title_ids', to_jsonb(v_titles), 'kind', v_kind, 'closes_at', v_closes));
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'finale'));
    return v_round_id;
  end if;

  -- 1. Shortlisted films, most liked first.
  select coalesce(array_agg(m.title_id order by m.rn), '{}') into v_titles
  from (
    select c.title_id,
           row_number() over (order by c.like_count + 2 * c.super_like_count desc, c.group_score desc, c.title_id) as rn
    from public.room_cards c
    where c.room_id = p_room_id and c.state = 'matched'
  ) m;
  v_titles := v_titles[1:v_size];

  -- A present seat is covered when it liked a film that is in the list.
  select coalesce(array_agg(distinct v.room_member_id), '{}') into v_covered
  from public.votes v
  where v.room_id = p_room_id and v.title_id = any (v_titles)
    and v.room_member_id = any (v_presents)
    and v.answer in ('like', 'super_like', 'seen_rewatch');

  -- 2. One seat each: the liked film that covers the most uncovered present seats, ties to rule 3's
  -- order, then the group score, then the lowest film id. Stops when the list is full or no
  -- uncovered present seat has a like on a film that is not in yet.
  while coalesce(cardinality(v_titles), 0) < v_size loop
    select x.title_id into v_next
    from (
      select c.title_id, c.group_score,
             c.like_count + 2 * c.super_like_count - c.nope_count as k1,
             count(distinct v.room_member_id) as seats
      from public.room_cards c
      join public.votes v on v.room_id = c.room_id and v.title_id = c.title_id
      where c.room_id = p_room_id and c.state = 'active'
        and not (c.title_id = any (v_titles))
        and v.answer in ('like', 'super_like', 'seen_rewatch')
        and v.room_member_id = any (v_presents)
        and not (v.room_member_id = any (v_covered))
      group by c.title_id, c.group_score, c.like_count, c.super_like_count, c.nope_count
    ) x
    order by x.seats desc, x.k1 desc, x.group_score desc, x.title_id
    limit 1;
    exit when v_next is null;

    v_titles := v_titles || v_next;
    select coalesce(array_agg(distinct s), '{}') into v_covered
    from unnest(v_covered || coalesce((
      select array_agg(v.room_member_id) from public.votes v
      where v.room_id = p_room_id and v.title_id = v_next
        and v.room_member_id = any (v_presents)
        and v.answer in ('like', 'super_like', 'seen_rewatch')
    ), '{}')) as s;
  end loop;

  -- 3 and 4. Films with a like by score, then films nobody has noped by group score, until full.
  select v_titles || coalesce(array_agg(t.title_id order by t.tier, t.ord), '{}') into v_titles
  from (
    select x.title_id, x.tier,
           row_number() over (partition by x.tier order by x.k1 desc, x.group_score desc, x.title_id) as ord
    from (
      select c.title_id, c.group_score,
             case when c.like_count + c.super_like_count >= 1 then 2 else 3 end as tier,
             c.like_count + 2 * c.super_like_count - c.nope_count as k1
      from public.room_cards c
      where c.room_id = p_room_id
        and c.state = 'active'
        and not (c.title_id = any (v_titles))
        and (c.like_count + c.super_like_count >= 1 or c.nope_count = 0)
    ) x
  ) t;
  v_titles := v_titles[1:v_size];

  if cardinality(v_titles) = 1 then
    select * into v_card from public.room_cards c where c.room_id = p_room_id and c.title_id = v_titles[1];
    insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
    values (p_room_id, v_titles[1], 'finale', v_card.like_count + v_card.super_like_count, v_present, 1)
    on conflict (room_id, title_id) do update
      set kind = 'finale', pick_order = 1,
          like_count = excluded.like_count, present_count = excluded.present_count;
    update public.room_cards set state = 'matched' where room_id = p_room_id and title_id = v_titles[1];
    update public.rooms
    set state = 'done', finale_at = now(), decided_at = now(), ended_at = now(), finale_reason = p_reason
    where id = p_room_id;
    perform internal.broadcast_room(p_room_id, 'match', jsonb_build_object(
      'title_id', v_titles[1], 'kind', 'finale', 'decided', true,
      'likes', v_card.like_count + v_card.super_like_count, 'of', v_present,
      'reason', 'only_film', 'finalists', '[]'::jsonb));
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
    return null;
  end if;

  v_closes := now() + interval '60 seconds';
  insert into public.rounds (room_id, kind, stage, stage_closes_at)
  values (p_room_id, v_kind, 'vote', v_closes)
  returning id into v_round_id;

  insert into public.round_candidates (round_id, title_id, seed)
  select v_round_id, u.t, u.o::smallint from unnest(v_titles) with ordinality as u(t, o);
  update public.room_cards set state = 'finalist'
  where room_id = p_room_id and title_id = any (v_titles) and state = 'active';
  update public.rooms set state = 'finale', finale_at = now(), finale_reason = p_reason where id = p_room_id;

  perform internal.broadcast_room(p_room_id, 'finale_started', jsonb_build_object(
    'round_id', v_round_id, 'title_ids', to_jsonb(v_titles), 'kind', v_kind, 'closes_at', v_closes));
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'finale'));
  return v_round_id;
end
$$;

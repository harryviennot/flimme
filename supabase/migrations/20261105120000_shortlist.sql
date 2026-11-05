-- M6.34: matches build a shortlist (three-matches-and-fair-finalists.md#decided,
-- game-modes.md#when-its-a-match). A whole-room match joins the shortlist and swiping goes on; the
-- match that fills it (the mode's matches_to_end, 3 at launch) starts the finale at once.
-- Replaced whole: internal.check_card_match (from 20261104224803), internal.recheck_room_matches
-- (from 20261104110821) and internal.write_room_stats (from 20261104202447). api.game_modes gains
-- matches_to_end at the end (compatible, no _v2). game_modes.ends_on_first_match stays and is false.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The mode's shortlist size. A missing value reads as 3.
update public.game_modes
set defaults = defaults || '{"matches_to_end": 3}', ends_on_first_match = false
where slug in ('quick_match', 'final_cut', 'date_night');

-- When the whole room matched the film. Null for the finale's own rows. The stats count matches
-- through it, because a match that wins the vote has its kind overwritten to finale.
alter table public.matches add column matched_at timestamptz;

update public.matches set matched_at = created_at where kind in ('unanimous', 'majority');

create or replace view api.game_modes with (security_invoker = true) as
  select gm.slug, gm.min_players, gm.max_players, gm.ends_on_first_match, gm.sort,
         coalesce((gm.defaults->>'matches_to_end')::integer, 3) as matches_to_end
  from public.game_modes gm;

-- Applies the room's rule to one card. The caller holds the room lock. Null unless the room is
-- swiping and the card active. A match joins the shortlist; the one that fills it (n reaches the
-- mode's matches_to_end) starts the finale with reason shortlist_full, after the match is sent.
-- A mode with matches_to_end 1 keeps the instant pick: pick_order 1, the room is done.
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
  v_count integer;
  v_end integer;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.state is distinct from 'swiping' then
    return null;
  end if;
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
  insert into public.matches (room_id, title_id, kind, like_count, present_count, matched_at)
  values (p_room_id, p_title_id, v_kind, v_likes, v_voters, now());

  select count(*) into v_count from public.matches where room_id = p_room_id and matched_at is not null;
  select coalesce((gm.defaults->>'matches_to_end')::integer, 3) into v_end
  from public.game_modes gm where gm.slug = v_room.mode;
  v_end := greatest(coalesce(v_end, 3), 1);

  if v_end = 1 then
    update public.matches set pick_order = 1 where room_id = p_room_id and title_id = p_title_id;
    update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = p_room_id;
    v_decided := true;
    perform internal.broadcast_room(p_room_id, 'match', jsonb_build_object(
      'title_id', p_title_id, 'kind', v_kind, 'likes', v_likes, 'of', v_voters, 'decided', true,
      'shortlisted', 1, 'shortlist_size', 1));
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
    return jsonb_build_object('match', true, 'kind', v_kind, 'decided', true);
  end if;

  perform internal.broadcast_room(p_room_id, 'match', jsonb_build_object(
    'title_id', p_title_id, 'kind', v_kind, 'likes', v_likes, 'of', v_voters, 'decided', false,
    'shortlisted', v_count, 'shortlist_size', v_end));
  if v_count >= v_end then
    perform internal.start_finale(
      p_room_id,
      internal.pick_rule(v_room.rule, cardinality(internal.present_member_ids(p_room_id))),
      'shortlist_full');
  end if;
  return jsonb_build_object('match', true, 'kind', v_kind, 'decided', v_decided);
end
$$;

-- If everyone still here liked a card, that's a match now (data-model.md#leaving-and-coming-back).
-- Active cards with likes, in a fixed order, until the room leaves swiping (the shortlist filled, or
-- the pick is made): most likes (super likes count), then most super likes, then the higher group
-- score, then the lowest film id. Callers hold the room lock and have already set the seat's left_at.
create or replace function internal.recheck_room_matches(p_room_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_title bigint;
begin
  for v_title in
    select c.title_id from public.room_cards c
    where c.room_id = p_room_id and c.state = 'active' and c.like_count + c.super_like_count > 0
    order by c.like_count + c.super_like_count desc,
             c.super_like_count desc,
             c.group_score desc,
             c.title_id asc
  loop
    exit when (select r.state from public.rooms r where r.id = p_room_id) <> 'swiping';
    perform internal.check_card_match(p_room_id, v_title);
  end loop;
end
$$;

revoke all on function internal.recheck_room_matches(uuid) from public, anon, authenticated;

-- Computes and overwrites rooms.stats for a room that has ended, and returns it. A room still in
-- play (lobby, dealing, swiping, finale) is skipped: null, nothing written.
-- outcome: match (pick_order 1 of kind unanimous or majority), finale (kind finale), no_pick (done
-- without a pick), abandoned. swipes_per_seat is the median swipe_count over the seats that swiped
-- at least once, players their number. matches counts the rows with matched_at, so a match that
-- won the vote (its kind turned finale) still counts.
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
    'matches', v_matches);

  update public.rooms set stats = v_stats where id = p_room_id;
  return v_stats;
end
$$;

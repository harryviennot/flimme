-- M6.2: "Seen it" in rooms that allow rewatches, no abstentions, the near miss one like short, flipped
-- (game-modes.md#the-answers, #when-its-a-match, moments.md#the-near-miss, app-structure.md#the-card-stack).
-- Replaced whole: internal.check_card_match (from the baseline) and api.cast_vote (from
-- 20261103180000_vote_any_pool_card.sql, which kept M5.4's seen mark and M5.7's restore).
-- api.cast_vote gets a trailing argument, so it is dropped and recreated (a new argument list would
-- otherwise add an overload). Every named caller keeps working, so no _v2.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Whether the card was flipped when it was answered. Training data only, never shown to a phone.
alter table public.swipe_log add column if not exists flipped boolean;

-- How many likes a rule needs from this many voters. null when the rule has no instant rule.
create function internal.likes_needed(p_rule jsonb, p_voters integer) returns integer
language sql immutable security definer set search_path = ''
as $$
  select case p_rule->>'instant_rule'
    when 'all_like' then p_voters
    when 'share_like' then ceil((p_rule->>'share_threshold')::numeric * p_voters)::integer
  end
$$;
revoke execute on function internal.likes_needed(jsonb, integer) from public, anon, authenticated;

-- Applies the room's rule to one card. The caller holds the room lock.
-- Every present player counts as a voter and only likes help ("Seen it" no longer abstains).
-- seen_rewatch is a like. The no-match answer says how many likes the rule needs.
create or replace function internal.check_card_match(p_room_id uuid, p_title_id bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_present uuid[];
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

  v_present := internal.present_member_ids(p_room_id);
  v_rule := internal.pick_rule(v_room.rule, cardinality(v_present));

  select count(*) filter (where v.answer in ('like', 'super_like', 'seen_rewatch'))
  into v_likes
  from public.votes v
  where v.room_id = p_room_id and v.title_id = p_title_id and v.room_member_id = any (v_present);

  v_voters := cardinality(v_present);
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
  return jsonb_build_object('match', true, 'kind', v_kind, 'decided', v_decided);
end
$$;

-- Replaced just below with one more optional argument; every named caller keeps working.
-- squawk-ignore ban-drop-function
drop function api.cast_vote(uuid, bigint, public.vote_answer, uuid, integer, timestamptz);

create function api.cast_vote(
  p_room_id uuid,
  p_title_id bigint,
  p_answer public.vote_answer,
  p_member_id uuid default null,
  p_dwell_ms integer default null,
  p_client_at timestamptz default null,
  p_flipped boolean default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_entry public.deck_entries;
  v_restore boolean;
  v_card public.room_cards;
  v_check jsonb;
  v_touched uuid[];
  v_round uuid;
  v_remaining integer;
  v_dwell_ms integer;
  v_client_at timestamptz;
  v_is_like boolean;
begin
  -- One lock per room: votes in a room run one after another (a few ms each),
  -- so counting and deciding never race. Rooms do not block each other.
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    raise exception 'room not found' using errcode = '42501';
  end if;

  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
    and m.left_at is null;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if v_room.state <> 'swiping' then
    return jsonb_build_object('status', 'closed', 'state', v_room.state);
  end if;

  -- The seen rule can't change mid-game, so only a buggy client asks "watch it again" in a hide_seen room.
  if p_answer = 'seen_rewatch' and v_room.seen_rule = 'hide_seen' then
    raise exception 'seen_rewatch needs a room that allows rewatches' using errcode = '22023';
  end if;

  -- Phones are not trusted: a dwell outside 0 to 120,000 ms and a client time
  -- outside the room's start and now would only pollute the training data.
  v_dwell_ms := case when p_dwell_ms is null then null else least(greatest(p_dwell_ms, 0), 120000) end;
  v_client_at := case when p_client_at is null then null
                      else greatest(least(p_client_at, now()), v_room.started_at) end;

  select c.* into v_card from public.room_cards c where c.room_id = p_room_id and c.title_id = p_title_id;
  if not found then
    raise exception 'card not in this room' using errcode = '22023';
  end if;
  if v_card.state = 'dropped' then
    return jsonb_build_object('status', 'dropped');
  end if;

  select d.* into v_entry from public.deck_entries d
  where d.room_member_id = v_member.id and d.title_id = p_title_id;
  v_restore := not found;
  -- No entry and not an active card (matched, finalist): it was never the seat's to swipe.
  if v_restore and v_card.state <> 'active' then
    raise exception 'card was not dealt to this seat' using errcode = '22023';
  end if;

  if p_answer = 'super_like' and v_member.super_likes_left <= 0 then
    return jsonb_build_object('status', 'no_super_likes');
  end if;

  -- A refill re-ranks the deck behind the 3 mounted cards, so a swipe can arrive for a card the
  -- re-rank removed (or one the seat never had). The vote still counts: the entry comes back as a
  -- ranked card with the pool's score, last in the seat's deck. It gets a vote right below, so it
  -- never counts among the remaining cards. A retry finds the entry from the first vote (re-ranks
  -- and drops never delete an entry that has a vote), so a duplicate restores nothing.
  if v_restore then
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score, request_id)
    select p_room_id, v_member.id, p_title_id, coalesce(max(d.sort_key), 0) + 1, 'ranked', v_card.group_score, null
    from public.deck_entries d where d.room_member_id = v_member.id
    returning * into v_entry;
  end if;

  insert into public.votes (room_id, room_member_id, title_id, answer, client_created_at)
  values (p_room_id, v_member.id, p_title_id, p_answer, v_client_at)
  on conflict (room_member_id, title_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'duplicate');   -- an offline retry of a saved vote
  end if;

  -- "Seen it" is also the player's own mark: later rooms leave the film out
  -- (deck_candidates reads user_titles). Every seen rule saves it, and so does "watch it again".
  -- A seat without a profile (a deleted account) saves nothing. A mark from another
  -- source, a rating or a reaction on the same row stays as it is.
  if p_answer in ('seen', 'seen_rewatch') and v_member.profile_id is not null then
    insert into public.user_titles as ut (profile_id, title_id, source, seen)
    values (v_member.profile_id, p_title_id, 'app', true)
    on conflict (profile_id, title_id, source) do update
      set seen = true, updated_at = now();
  end if;

  update public.room_members
  set swipe_count = swipe_count + 1,
      last_active_at = now(),
      super_likes_left = super_likes_left - (p_answer = 'super_like')::int
  where id = v_member.id;

  -- Counters by meaning: seen_rewatch is a like and a seen; a plain seen outside hide_seen is a
  -- nope and a seen; under hide_seen a seen only drops the film.
  update public.room_cards
  set like_count = like_count + (p_answer in ('like', 'seen_rewatch'))::int,
      super_like_count = super_like_count + (p_answer = 'super_like')::int,
      nope_count = nope_count + (p_answer = 'nope' or (p_answer = 'seen' and v_room.seen_rule <> 'hide_seen'))::int,
      seen_count = seen_count + (p_answer in ('seen', 'seen_rewatch'))::int
  where room_id = p_room_id and title_id = p_title_id
  returning * into v_card;

  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer, deck_source, score, dwell_ms, flipped)
  values (p_room_id, v_member.id, p_title_id, 'vote', p_answer, v_entry.source, v_entry.score, v_dwell_ms, p_flipped);

  -- "Seen it" under hide_seen takes the card out of every deck that has not reached it.
  if p_answer = 'seen' and v_room.seen_rule = 'hide_seen' and v_card.state = 'active' then
    update public.room_cards set state = 'dropped' where room_id = p_room_id and title_id = p_title_id;
    with removed as (
      delete from public.deck_entries d
      where d.room_id = p_room_id and d.title_id = p_title_id
        and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
      returning d.room_member_id
    )
    select coalesce(array_agg(room_member_id), '{}') into v_touched from removed;
    if cardinality(v_touched) > 0 then
      perform internal.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
    end if;
  end if;

  v_is_like := p_answer in ('like', 'super_like', 'seen_rewatch');
  if v_is_like then
    v_check := internal.check_card_match(p_room_id, p_title_id);
    if v_check->>'match' = 'false' then
      -- The near miss: exactly one like short of the rule, at least 2 likes, and someone present
      -- who can still answer (no events on films that can't match).
      if v_room.reveal = 'party'
         and (v_check->>'likes')::int >= 2
         and (v_check->>'needed') is not null
         and (v_check->>'likes')::int = (v_check->>'needed')::int - 1
         and exists (
           select 1 from unnest(internal.present_member_ids(p_room_id)) pm(id)
           where not exists (select 1 from public.votes v where v.room_member_id = pm.id and v.title_id = p_title_id)
         ) then
        perform internal.broadcast_room(p_room_id, 'near_miss', jsonb_build_object(
          'title_id', p_title_id, 'likes', v_check->'likes', 'of', v_check->'of', 'needed', v_check->'needed'));
      end if;
      if v_card.like_count + v_card.super_like_count = 1 then
        v_touched := internal.propagate_like(p_room_id, p_title_id, v_member.id);
        if cardinality(v_touched) > 0 then
          perform internal.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
        end if;
      end if;
    end if;
  end if;

  if v_check is null or (v_check->>'decided') is distinct from 'true' then
    v_round := internal.maybe_start_finale(p_room_id);
  end if;

  -- More cards when this seat is down to 15: under deck_engine 'sql' the
  -- baseline deals them now (deal_cards broadcasts deck_updated); under
  -- 'server' a request is queued, and one older than 30 seconds is assumed
  -- lost and sent again.
  if v_round is null and (v_check is null or (v_check->>'decided') is distinct from 'true') then
    select count(*) into v_remaining
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where d.room_member_id = v_member.id
      and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id);
    if v_remaining <= 15
       and (v_member.refill_requested_at is null or v_member.refill_requested_at < now() - interval '30 seconds') then
      if internal.deck_engine() = 'sql' then
        -- Nothing left to deal: set the flag, so the 30-second guard above
        -- stops every later vote from searching again.
        if (internal.deal_baseline(p_room_id, v_member.id)->>'seats')::int = 0 then
          update public.room_members set refill_requested_at = now() where id = v_member.id;
        end if;
      else
        update public.room_members set refill_requested_at = now() where id = v_member.id;
        perform internal.enqueue('deck_requests', jsonb_build_object(
          'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
      end if;
    end if;
  end if;

  return jsonb_build_object('status', 'ok')
    || jsonb_build_object('match', coalesce(v_check->'match', 'false'::jsonb))
    || case when v_check->>'match' = 'true' then jsonb_build_object('kind', v_check->'kind', 'decided', v_check->'decided')
            else '{}'::jsonb end
    || case when v_round is not null then jsonb_build_object('finale_round_id', v_round) else '{}'::jsonb end;
end
$$;

grant execute on function api.cast_vote(uuid, bigint, public.vote_answer, uuid, integer, timestamptz, boolean) to authenticated;

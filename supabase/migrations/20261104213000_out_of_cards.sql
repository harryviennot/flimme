-- M6.29: out of cards (game-modes.md#how-a-game-ends "Running out of cards", #when-it-starts).
-- A seat with no unanswered card, once the SQL baseline tried right then dealt it nothing, is done
-- (room_members.done_at). api.request_cards answers `done` with the room's liked count. An undo that
-- gives a card back clears it. internal.maybe_start_finale opens the finale with reason all_done
-- when every present seat is done and a film has a like. api.cast_vote also adds the room's state to
-- its ok answer when the vote left the room no longer swiping (review finding 5).
-- Replaced whole: api.cast_vote (from 20261104174722), api.request_cards (from 20261102220000),
-- api.undo_last_vote (from 20261104120000), internal.maybe_start_finale (from 20261104174722).
-- Same signatures; no _v2.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- The seat's cards still ahead of it: dealt, on an active card, with no vote.
create function internal.unanswered_count(p_member_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int
  from public.deck_entries d
  join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
  where d.room_member_id = p_member_id
    and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
$$;

-- Marks the seat done when it has no card left after the SQL baseline tried right now. The caller
-- holds the room lock and the room is swiping. Returns true when the seat is done.
create function internal.settle_seat_done(p_room_id uuid, p_member_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if internal.unanswered_count(p_member_id) > 0 then
    return false;
  end if;
  perform internal.deal_baseline(p_room_id, p_member_id);
  if internal.unanswered_count(p_member_id) > 0 then
    return false;
  end if;
  update public.room_members set done_at = coalesce(done_at, now()) where id = p_member_id;
  return true;
end
$$;

-- The room's films with a like, in any state but dropped. A count, never which films or who.
create function internal.liked_count(p_room_id uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from public.room_cards c
  where c.room_id = p_room_id and c.state <> 'dropped' and c.like_count + c.super_like_count >= 1
$$;

-- The seat has nothing left and the baseline just dealt it nothing: mark it done, open the finale if
-- it was the last present seat to finish, and answer `done`. The caller holds the room lock.
create function internal.finish_seat(p_room_id uuid, p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_members set done_at = coalesce(done_at, now()) where id = p_member_id;
  perform internal.maybe_start_finale(p_room_id);
  return jsonb_build_object('status', 'done', 'liked', internal.liked_count(p_room_id));
end
$$;

create or replace function internal.maybe_start_finale(p_room_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_present uuid[];
  v_rule jsonb;
  v_cards boolean := false;
  v_time boolean := false;
  v_all_done boolean := false;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.state <> 'swiping' then
    return null;
  end if;
  v_present := internal.present_member_ids(p_room_id);
  v_rule := internal.pick_rule(v_room.rule, cardinality(v_present));

  -- The card count applies to players seated when swiping started; a late joiner never holds it up.
  if (v_rule->>'finale_after_cards') is not null then
    v_cards := exists (
        select 1 from public.room_members m
        where m.room_id = p_room_id and m.id = any (v_present)
          and m.joined_at <= v_room.started_at and m.left_at is null)
      and not exists (
        select 1 from public.room_members m
        where m.room_id = p_room_id and m.id = any (v_present)
          and m.joined_at <= v_room.started_at and m.left_at is null
          and m.swipe_count < (v_rule->>'finale_after_cards')::int);
  end if;
  -- The time limit applies to everyone.
  if (v_rule->>'finale_after_seconds') is not null then
    v_time := now() >= v_room.started_at + make_interval(secs => (v_rule->>'finale_after_seconds')::int);
  end if;

  -- Everyone out of cards: every present seat is done (a late joiner counts, unlike the card count)
  -- and a film has a like. Without a like the room waits for the sweeper (M6.6).
  if cardinality(v_present) > 0 then
    v_all_done := not exists (
        select 1 from public.room_members m where m.id = any (v_present) and m.done_at is null)
      and internal.liked_count(p_room_id) > 0;
  end if;

  if v_cards or v_time or v_all_done then
    return internal.start_finale(p_room_id, v_rule,
      case when v_cards then 'cards' when v_time then 'time' else 'all_done' end::public.finale_reason);
  end if;
  return null;
end
$$;

create or replace function api.cast_vote(
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
  v_tried boolean := false;
  v_state public.room_state;
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
      set seen = true, updated_at = now()
      where not ut.seen;   -- a mark that was already there keeps its updated_at, so undo leaves it
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
  -- A vote that ended the room (one film, no pick) leaves nothing to refill.
  if v_round is null and (v_check is null or (v_check->>'decided') is distinct from 'true')
     and (select r.state from public.rooms r where r.id = p_room_id) = 'swiping' then
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
        v_tried := true;
        if (internal.deal_baseline(p_room_id, v_member.id)->>'seats')::int = 0 then
          update public.room_members set refill_requested_at = now() where id = v_member.id;
        end if;
      else
        update public.room_members set refill_requested_at = now() where id = v_member.id;
        perform internal.enqueue('deck_requests', jsonb_build_object(
          'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
      end if;
    end if;

    -- Out of cards: under the SQL engine a seat with no card left, after the baseline tried right
    -- now (above, or here when the 30-second guard held it back), is done, and that may be the
    -- last seat the finale waited for. Under the server engine the seat is done only once
    -- api.request_cards runs the baseline and it deals nothing.
    if internal.deck_engine() = 'sql' and internal.unanswered_count(v_member.id) = 0 then
      if v_tried then
        update public.room_members set done_at = coalesce(done_at, now()) where id = v_member.id;
      else
        perform internal.settle_seat_done(p_room_id, v_member.id);
      end if;
      if (select m.done_at from public.room_members m where m.id = v_member.id) is not null then
        v_round := internal.maybe_start_finale(p_room_id);
      end if;
    end if;
  end if;

  select r.state into v_state from public.rooms r where r.id = p_room_id;

  return jsonb_build_object('status', 'ok')
    || jsonb_build_object('match', coalesce(v_check->'match', 'false'::jsonb))
    || case when v_check->>'match' = 'true' then jsonb_build_object('kind', v_check->'kind', 'decided', v_check->'decided')
            else '{}'::jsonb end
    || case when v_round is not null then jsonb_build_object('finale_round_id', v_round) else '{}'::jsonb end
    || case when v_state <> 'swiping' then jsonb_build_object('state', v_state) else '{}'::jsonb end;
end
$$;
grant execute on function api.cast_vote(uuid, bigint, public.vote_answer, uuid, integer, timestamptz, boolean) to authenticated;

create or replace function api.undo_last_vote(p_room_id uuid, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_last public.swipe_log;
  v_vote public.votes;
  v_card public.room_cards;
  v_check jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    raise exception 'room not found' using errcode = '42501';
  end if;

  -- A seat that left or was removed (removing sets left_at too) can't undo, like it can't vote.
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
    and m.left_at is null;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if v_room.state <> 'swiping' then
    return jsonb_build_object('status', 'closed');
  end if;

  -- The seat's last action: an undo means a second undo in a row. The log's own id orders it, since
  -- rows of one transaction share a created_at.
  select l.* into v_last from public.swipe_log l
  where l.room_member_id = v_member.id order by l.id desc limit 1;
  if not found or v_last.action = 'undo' then
    return jsonb_build_object('status', 'nothing_to_undo');
  end if;

  select v.* into v_vote from public.votes v
  where v.room_member_id = v_member.id and v.title_id = v_last.title_id;
  if not found then
    return jsonb_build_object('status', 'nothing_to_undo');
  end if;

  select c.* into v_card from public.room_cards c
  where c.room_id = p_room_id and c.title_id = v_vote.title_id;
  -- Matched, finalist, or dropped by someone else's "Seen it": it can't be undone. The one dropped
  -- card that can: my own "Seen it" under hide_seen, when nobody else said it.
  if v_card.state <> 'active'
     and not (v_card.state = 'dropped' and v_vote.answer = 'seen'
              and v_room.seen_rule = 'hide_seen' and v_card.seen_count = 1) then
    return jsonb_build_object('status', 'locked');
  end if;

  delete from public.votes where room_member_id = v_member.id and title_id = v_vote.title_id;

  -- Counters by the answer's meaning, as cast_vote added them.
  update public.room_cards
  set like_count = like_count - (v_vote.answer in ('like', 'seen_rewatch'))::int,
      super_like_count = super_like_count - (v_vote.answer = 'super_like')::int,
      nope_count = nope_count - (v_vote.answer = 'nope' or (v_vote.answer = 'seen' and v_room.seen_rule <> 'hide_seen'))::int,
      seen_count = seen_count - (v_vote.answer in ('seen', 'seen_rewatch'))::int,
      state = case when v_card.state = 'dropped' then 'active' else state end
  where room_id = p_room_id and title_id = v_vote.title_id;

  update public.room_members
  set swipe_count = swipe_count - 1,
      done_at = null,   -- the undone card is ahead of the seat again
      super_likes_left = super_likes_left + (v_vote.answer = 'super_like')::int,
      last_active_at = now()
  where id = v_member.id;

  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer)
  values (p_room_id, v_member.id, v_vote.title_id, 'undo', v_vote.answer);

  -- The seen mark this vote made goes with it (decisions.md): a mark whose row was last written in
  -- the vote's own transaction. A row with nothing else on it is deleted, otherwise seen goes false.
  if v_vote.answer in ('seen', 'seen_rewatch') and v_member.profile_id is not null then
    update public.user_titles ut
    set seen = false, updated_at = now()
    where ut.profile_id = v_member.profile_id and ut.title_id = v_vote.title_id and ut.source = 'app'
      and ut.seen and ut.updated_at = v_vote.created_at
      and (ut.rating is not null or ut.on_watchlist or ut.reaction is not null
           or ut.rewatch_count > 0 or ut.last_watched_on is not null);
    delete from public.user_titles ut
    where ut.profile_id = v_member.profile_id and ut.title_id = v_vote.title_id and ut.source = 'app'
      and ut.seen and ut.updated_at = v_vote.created_at
      and ut.rating is null and not ut.on_watchlist and ut.reaction is null
      and ut.rewatch_count = 0 and ut.last_watched_on is null;
  end if;

  -- Undoing a like on a film that sat one like short of the rule: waiting phones hide their toast.
  -- The new count is one below the old one, so the old one was needed minus 1 when this is needed minus 2.
  -- Unlike cast_vote, no "someone can still answer" test: an extra hide event on a phone that shows no toast is harmless.
  if v_room.reveal = 'party' and v_vote.answer in ('like', 'super_like', 'seen_rewatch') then
    v_check := internal.check_card_match(p_room_id, v_vote.title_id);
    if v_check->>'match' = 'false'
       and (v_check->>'needed') is not null
       and (v_check->>'likes')::int >= 1
       and (v_check->>'likes')::int = (v_check->>'needed')::int - 2 then
      perform internal.broadcast_room(p_room_id, 'near_miss', jsonb_build_object(
        'title_id', v_vote.title_id, 'likes', v_check->'likes', 'of', v_check->'of', 'needed', v_check->'needed'));
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'title_id', v_vote.title_id);
end
$$;

create or replace function api.request_cards(p_room_id uuid, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_member public.room_members;
  v_remaining integer;
  v_deal jsonb;
begin
  select state into v_state from public.rooms where id = p_room_id for no key update;
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
    and m.left_at is null;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if v_state <> 'swiping' then
    return jsonb_build_object('status', 'closed', 'state', v_state);
  end if;

  v_remaining := internal.unanswered_count(v_member.id);
  if v_remaining > 5 then
    return jsonb_build_object('status', 'enough', 'remaining', v_remaining);
  end if;
  -- Done already: nothing is left to deal, and the phone is told what caused it.
  if v_remaining = 0 and v_member.done_at is not null then
    return jsonb_build_object('status', 'done', 'liked', internal.liked_count(p_room_id));
  end if;

  if internal.deck_engine() = 'sql' then
    v_deal := internal.deal_baseline(p_room_id, v_member.id);
    if v_remaining = 0 and internal.unanswered_count(v_member.id) = 0 then
      return internal.finish_seat(p_room_id, v_member.id);
    end if;
    return v_deal;
  end if;
  if v_member.refill_requested_at is null then
    update public.room_members set refill_requested_at = now() where id = v_member.id;
    perform internal.enqueue('deck_requests', jsonb_build_object(
      'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
    return jsonb_build_object('status', 'queued');
  end if;
  if now() - v_member.refill_requested_at > interval '8 seconds' then
    v_deal := internal.deal_baseline(p_room_id, v_member.id);
    if v_remaining = 0 and internal.unanswered_count(v_member.id) = 0 then
      return internal.finish_seat(p_room_id, v_member.id);
    end if;
    return v_deal || jsonb_build_object('fallback', true);
  end if;
  return jsonb_build_object('status', 'queued');
end
$$;

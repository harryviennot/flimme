-- M6.41: My films in user_titles (solo-and-my-films.md sections 6, 7 and 10, privacy.md "Film history").
-- Likes, super likes and a group's pick are saved to the player's own rows; undo takes a like back;
-- api.my_films lists them; api.my_film_card reads a card outside a room, scoped to the caller's own
-- films; api.set_film_seen and api.remove_my_film edit the rows; the export carries the new columns.
-- Replaced whole from their latest versions: api.cast_vote and api.undo_last_vote (20261104213000),
-- internal.deck_candidates (20261105160000), api.export_my_data (20261105085545). The rest is new.
-- Nothing in a room, a label, a card back, an event or a log reads liked_at, super_liked or picked_at.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.user_titles
  add column if not exists liked_at timestamptz,
  add column if not exists super_liked boolean not null default false,
  add column if not exists picked_at timestamptz,
  add column if not exists seen_at timestamptz;

-- Deletes the player's app and solo rows for a film that hold nothing any more.
create function internal.prune_film_rows(p_profile_id uuid, p_title_id bigint) returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.user_titles ut
  where ut.profile_id = p_profile_id and ut.title_id = p_title_id and ut.source in ('app', 'solo')
    and not ut.seen and ut.rating is null and not ut.on_watchlist and ut.reaction is null
    and ut.rewatch_count = 0 and ut.last_watched_on is null
    and ut.liked_at is null and not ut.super_liked and ut.picked_at is null
$$;
revoke execute on function internal.prune_film_rows(uuid, bigint) from public, anon, authenticated;

-- A group's pick (a match that becomes pick 1, whichever function makes it) marks the film for every
-- seat that is still in the room. A solo pick sets nothing.
create function internal.mark_group_pick() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.rooms r where r.id = new.room_id and r.mode <> 'solo') then
    insert into public.user_titles as ut (profile_id, title_id, source, picked_at)
    select distinct m.profile_id, new.title_id, 'app'::public.title_fact_source, now()
    from public.room_members m
    where m.room_id = new.room_id and m.profile_id is not null
      and m.left_at is null and m.removed_at is null
    on conflict (profile_id, title_id, source) do update
      set picked_at = excluded.picked_at, updated_at = now()
      where ut.picked_at is null;
  end if;
  return null;
end
$$;
revoke execute on function internal.mark_group_pick() from public, anon, authenticated;

create trigger matches_mark_pick
  after insert or update of pick_order on public.matches
  for each row when (new.pick_order = 1)
  execute function internal.mark_group_pick();

-- Solo rooms also leave out what is in My films (M6.41). Same signature and return type.
create or replace function internal.deck_candidates(
  p_room_id uuid,
  p_limit integer default 300,
  p_misery_line real default 1.0
) returns table (
  title_id bigint,
  group_score real,
  min_fit real,
  fits jsonb,
  watchlist_count integer,
  quality_score real,
  crowd real,
  collection_id integer
)
language sql stable security definer set search_path = ''
as $$
  with room as (
    select r.* from public.rooms r where r.id = p_room_id
  ),
  -- The room's services and their variants ("Netflix basic with ads" under Netflix).
  services as (
    select coalesce(array_agg(p.id), '{}') as ids
    from public.providers p, room r
    where p.id = any (r.provider_ids) or p.parent_id = any (r.provider_ids)
  ),
  members as (
    select m.id as member_id, m.profile_id
    from public.room_members m
    where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
  ),
  dropped as (
    select coalesce((select rm.dropped_genre_ids from public.room_models rm where rm.room_id = p_room_id), '{}') as ids
  ),
  seen_by_player as (
    select ut.title_id, ut.profile_id, max(ut.rating) as rating
    from public.user_titles ut
    where ut.seen and ut.profile_id in (select profile_id from members)
    group by ut.title_id, ut.profile_id
  ),
  seen as (
    select s.title_id, bool_and(coalesce(s.rating, 0) >= 4) as rewatchable
    from seen_by_player s group by s.title_id
  ),
  -- Rows stay narrow from here on, so the percentiles sort in work_mem.
  eligible as (
    select t.id, t.popularity, t.quality_score, t.collection_id
    from room r
    cross join services sv
    cross join dropped d
    join public.titles t on t.media_type = 'movie' and t.is_active and not t.is_adult
    left join seen s on s.title_id = t.id
    where t.poster_path is not null
      and (r.runtime_max is null or t.runtime_min <= r.runtime_max)
      and case r.quality
            when 'standard' then t.vote_count >= 150 and t.quality_score >= 6.2::real
            when 'hidden_gems' then t.vote_count between 30 and 2000 and t.quality_score >= 7.0::real
            when 'guilty_pleasures' then t.vote_count >= 150 and t.quality_score >= 4.5::real
          end
      and exists (
            select 1 from public.title_availability a
            where a.title_id = t.id and a.country = r.country
              and a.provider_id = any (sv.ids) and a.kind = any (r.offer_kinds))
      and (r.max_age is null or exists (
            select 1 from public.title_certifications c
            where c.title_id = t.id and c.country = r.country and c.min_age <= r.max_age))
      and (r.seen_rule = 'show_all' or s.title_id is null or (r.seen_rule = 'allow_rewatch' and s.rewatchable))
      and not (t.genre_ids && d.ids)
      and not exists (select 1 from public.room_cards rc where rc.room_id = p_room_id and rc.title_id = t.id)
      -- A solo room leaves out every film the player answered, with any answer, in another solo room
      -- (an undone vote is gone, so that film may come back). Group rooms are not filtered.
      and (r.mode <> 'solo' or not exists (
            select 1 from public.votes v
            join public.room_members vm on vm.id = v.room_member_id
            join public.rooms vr on vr.id = vm.room_id
            where v.title_id = t.id and vr.mode = 'solo' and vr.id <> p_room_id
              and vm.profile_id in (select mm.profile_id from members mm)))
      -- ... and every film already in the player's My films (M6.41): liked, super liked or picked.
      and (r.mode <> 'solo' or not exists (
            select 1 from public.user_titles lu
            where lu.title_id = t.id and (lu.liked_at is not null or lu.picked_at is not null)
              and lu.profile_id in (select mm.profile_id from members mm)))
  ),
  crowds as (
    select e.id, e.quality_score, e.collection_id,
      (0.85 * percent_rank() over (order by e.quality_score)
        + 0.15 * percent_rank() over (order by e.popularity))::real as crowd
    from eligible e
  ),
  -- Everyone's fit is the same today, so the cut is made before any per-seat work.
  top as (
    select c.id, c.quality_score, c.collection_id, c.crowd, (5 * c.crowd)::real as score
    from crowds c
    where (5 * c.crowd)::real >= p_misery_line
    order by score desc, c.id
    limit p_limit
  )
  select tp.id, tp.score, tp.score,
    coalesce((select jsonb_object_agg(m.member_id, round(tp.score::numeric, 2)) from members m), '{}'),
    (select count(distinct ut.profile_id)::int from public.user_titles ut
      where ut.title_id = tp.id and ut.on_watchlist and ut.profile_id in (select profile_id from members)),
    tp.quality_score, tp.crowd, tp.collection_id
  from top tp
  order by tp.score desc, tp.id
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
  v_source public.title_fact_source;
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
  -- (deck_candidates reads user_titles). Every seen rule saves it, and so does "watch it again", on
  -- the app row in every room, solo included, with the time of a new mark.
  -- A seat without a profile (a deleted account) saves nothing. A mark from another
  -- source, a rating or a reaction on the same row stays as it is.
  if p_answer in ('seen', 'seen_rewatch') and v_member.profile_id is not null then
    insert into public.user_titles as ut (profile_id, title_id, source, seen, seen_at)
    values (v_member.profile_id, p_title_id, 'app', true, now())
    on conflict (profile_id, title_id, source) do update
      set seen = true, seen_at = now(), updated_at = now()
      where not ut.seen;   -- a mark that was already there keeps its time, so undo leaves it
  end if;

  -- A like, a super like and "watch it again" go to the player's film history (M6.41): the app row
  -- for a group room, the solo row for a solo room. The first liked_at of the row stays. Nothing
  -- here sets on_watchlist, and nothing in a room reads these columns.
  if p_answer in ('like', 'super_like', 'seen_rewatch') and v_member.profile_id is not null then
    v_source := case when v_room.mode = 'solo' then 'solo' else 'app' end;
    insert into public.user_titles as ut (profile_id, title_id, source, liked_at, super_liked)
    values (v_member.profile_id, p_title_id, v_source, now(), p_answer = 'super_like')
    on conflict (profile_id, title_id, source) do update
      set liked_at = coalesce(ut.liked_at, excluded.liked_at),
          super_liked = ut.super_liked or excluded.super_liked,
          updated_at = now()
      where ut.liked_at is null or (excluded.super_liked and not ut.super_liked);
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
  v_source public.title_fact_source;
  v_other_star boolean;
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

  -- What this vote set in the player's film history goes with it (M6.41). A mark is recognised by
  -- the time this vote wrote (cast_vote used the same transaction time for the vote), so a mark from
  -- an earlier room stays. A row left with nothing is deleted.
  if v_vote.answer in ('seen', 'seen_rewatch', 'like', 'super_like') and v_member.profile_id is not null then
    update public.user_titles ut
    set seen = false, seen_at = null, updated_at = now()
    where ut.profile_id = v_member.profile_id and ut.title_id = v_vote.title_id and ut.source = 'app'
      and v_vote.answer in ('seen', 'seen_rewatch') and ut.seen
      and (ut.seen_at = v_vote.created_at or (ut.seen_at is null and ut.updated_at = v_vote.created_at));

    if v_vote.answer in ('like', 'super_like', 'seen_rewatch') then
      v_source := case when v_room.mode = 'solo' then 'solo' else 'app' end;
      v_other_star := exists (
        select 1 from public.votes ov
        join public.room_members om on om.id = ov.room_member_id
        join public.rooms orr on orr.id = ov.room_id
        where om.profile_id = v_member.profile_id and ov.title_id = v_vote.title_id
          and ov.answer = 'super_like' and (orr.mode = 'solo') = (v_room.mode = 'solo'));
      -- A star stays when a super like in another room of this source gave one too.
      update public.user_titles ut
      set liked_at = case when ut.liked_at = v_vote.created_at then null else ut.liked_at end,
          super_liked = case when v_vote.answer = 'super_like' and not v_other_star then false else ut.super_liked end,
          updated_at = now()
      where ut.profile_id = v_member.profile_id and ut.title_id = v_vote.title_id and ut.source = v_source
        and (ut.liked_at = v_vote.created_at
             or (v_vote.answer = 'super_like' and ut.super_liked and not v_other_star));
    end if;

    perform internal.prune_film_rows(v_member.profile_id, v_vote.title_id);
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

-- The export carries the new columns and each game's mode (M6.41).
create or replace function api.export_my_data() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if internal.my_profile_id() is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('export:p:' || internal.my_profile_id(), 1, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  return (
  with me as (select internal.my_profile_id() as id)
    select jsonb_build_object('status', 'ok') || jsonb_build_object(
      'profile', (select to_jsonb(p) - 'auth_user_id' from public.profiles p, me where p.id = me.id),
      'services', (select coalesce(jsonb_agg(pp.provider_id), '[]') from public.profile_providers pp, me where pp.profile_id = me.id),
      'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id'), '[]') from public.consents c, me where c.profile_id = me.id),
      'linked_accounts', (
        select coalesce(jsonb_agg(jsonb_build_object('provider', la.provider, 'username', la.username,
                                                     'created_at', la.created_at, 'exported_at', la.exported_at,
                                                     'last_synced_at', la.last_synced_at)), '[]')
        from public.linked_accounts la, me where la.profile_id = me.id),
      'letterboxd_diary', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'film', e.film_name, 'year', e.film_year, 'watched_on', e.watched_on, 'rating', e.rating,
                 'rewatch', e.rewatch, 'source', e.source) order by e.watched_on), '[]')
        from public.letterboxd_entries e join public.linked_accounts la on la.id = e.linked_account_id, me
        where la.profile_id = me.id),
      'film_history', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'tmdb_id', t.tmdb_id, 'title', t.original_title, 'source', ut.source, 'seen', ut.seen,
                 'rating', ut.rating, 'on_watchlist', ut.on_watchlist,
                 'reaction', ut.reaction, 'last_watched_on', ut.last_watched_on,
                 'liked_at', ut.liked_at, 'super_liked', ut.super_liked, 'picked_at', ut.picked_at,
                 'seen_at', ut.seen_at)), '[]')
        from public.user_titles ut join public.titles t on t.id = ut.title_id, me
        where ut.profile_id = me.id),
      'taste', (select tp.affinities from public.taste_profiles tp, me where tp.profile_id = me.id),
      'games', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'room_id', m.room_id, 'mode', (select r.mode from public.rooms r where r.id = m.room_id), 'joined_at', m.joined_at, 'left_at', m.left_at,
                 'display_name', m.display_name, 'avatar_key', m.avatar_key, 'role', m.role,
                 'joined_via', m.joined_via, 'services', to_jsonb(m.provider_ids),
                 'votes', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'tmdb_id', t.tmdb_id, 'title', t.original_title, 'answer', v.answer,
                                  'at', v.created_at) order by v.created_at, t.tmdb_id), '[]')
                           from public.votes v join public.titles t on t.id = v.title_id
                           where v.room_member_id = m.id),
                 'swipes', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'tmdb_id', t.tmdb_id, 'action', s.action, 'answer', s.answer,
                                   'at', s.created_at, 'dwell_ms', s.dwell_ms) order by s.created_at, s.id), '[]')
                            from public.swipe_log s join public.titles t on t.id = s.title_id
                            where s.room_member_id = m.id),
                 'ballots', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'tmdb_id', t.tmdb_id, 'kind', b.kind, 'rank', b.rank,
                                    'at', b.created_at) order by b.created_at, b.id), '[]')
                             from public.round_ballots b left join public.titles t on t.id = b.title_id
                             where b.room_member_id = m.id),
                 'pick', (select jsonb_build_object('tmdb_id', t.tmdb_id, 'title', t.original_title, 'kind', mt.kind)
                          from public.matches mt join public.titles t on t.id = mt.title_id
                          where mt.room_id = m.room_id and mt.pick_order = 1),
                 'watched_answer', m.watched_answer,
                 'post_reaction', m.post_reaction) order by m.joined_at, m.id), '[]')
        from public.room_members m, me where m.profile_id = me.id)
    )
  );
end
$$;

-- ---------------------------------------------------------------------------
-- A card outside a room: the card api.title_cards builds, for one film, on the player's own saved
-- services in their profile country, the default offer kinds, no age cap. No reason label, no friend
-- rating. Null when the film does not exist.
-- ---------------------------------------------------------------------------
create function internal.profile_card_payloads(p_profile_id uuid, p_title_id bigint, p_language text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (
    select p.country,
           coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = p.id), '{}') as provider_ids
    from public.profiles p where p.id = p_profile_id
  )
  select jsonb_build_object(
    'title_id', t.id,
    'tmdb_id', t.tmdb_id,
    'title', coalesce(tr.title, en.title, t.original_title),
    'overview', coalesce(tr.overview, en.overview),
    'year', t.release_year,
    'runtime_min', t.runtime_min,
    'genre_ids', t.genre_ids,
    'tmdb_score', round(t.vote_average::numeric, 1),
    'tmdb_votes', t.vote_count,
    'poster_path', coalesce(tr.poster_path, t.poster_path),
    'poster_placeholder', t.poster_placeholder,
    'backdrop_path', t.backdrop_path,
    'trailer_key', t.trailer_key,
    'directors', (
      select coalesce(jsonb_agg(p.name order by c.ord), '[]')
      from public.title_credits c join public.people p on p.id = c.person_id
      where c.title_id = t.id and c.role = 'director'),
    'cast', (
      select coalesce(jsonb_agg(x.name order by x.ord), '[]')
      from (select p.name, c.ord from public.title_credits c join public.people p on p.id = c.person_id
            where c.title_id = t.id and c.role = 'cast' order by c.ord limit 5) x),
    'providers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'provider_id', s.main_id, 'kind', s.kind, 'name', s.name, 'logo_path', s.logo_path)
             order by s.main_id, s.kind), '[]')
      from (
        select distinct m.id as main_id, a.kind, m.name, m.logo_path
        from public.title_availability a
        join public.providers v on v.id = a.provider_id
        join public.providers m on m.id = coalesce(v.parent_id, v.id)
        where a.title_id = t.id and a.country = me.country
          and a.kind = any ('{subscription,free,ads}'::public.offer_kind[])
          and (v.id = any (me.provider_ids) or v.parent_id = any (me.provider_ids))
      ) s),
    'watch_link', (
      select w.tmdb_link from public.title_watch_links w where w.title_id = t.id and w.country = me.country)
  )
  from me
  cross join public.titles t
  left join public.title_translations tr on tr.title_id = t.id and tr.language = p_language
  left join public.title_translations en on en.title_id = t.id and en.language = 'en'
  where t.id = p_title_id
$$;
revoke execute on function internal.profile_card_payloads(uuid, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- My films: one page of Liked or Seen, newest first, 60 films a page. Opening it counts as activity
-- (guest cleanup reads profiles.last_seen_at), so it is volatile. Only the caller's own app and
-- solo rows; Letterboxd and calibration rows are never listed.
-- ---------------------------------------------------------------------------
create function api.my_films(
  p_segment text,
  p_filter text default 'all',
  p_cursor text default null,
  p_language text default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_lang text;
  v_after_at bigint;
  v_after_id bigint;
  v_films jsonb;
  v_next text;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if p_segment is null or p_segment not in ('liked', 'seen') then
    raise exception 'unknown segment' using errcode = '22023';
  end if;
  if p_filter is null or p_filter not in ('all', 'friends', 'solo') then
    raise exception 'unknown filter' using errcode = '22023';
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^-?[0-9]{1,18}_[0-9]{1,18}$' then
      raise exception 'bad cursor' using errcode = '22023';
    end if;
    v_after_at := split_part(p_cursor, '_', 1)::bigint;
    v_after_id := split_part(p_cursor, '_', 2)::bigint;
  end if;

  update public.profiles set last_seen_at = now() where id = v_profile;
  v_lang := coalesce(p_language, (select p.language from public.profiles p where p.id = v_profile), 'en');

  with picked as (
    select ut.title_id,
           case when p_segment = 'liked' then greatest(ut.liked_at, case when ut.source = 'app' then ut.picked_at end)
                else coalesce(ut.seen_at, ut.updated_at) end as at,
           p_segment = 'liked' and ut.super_liked as star,
           p_segment = 'liked' and ut.source = 'app' and ut.picked_at is not null as pick
    from public.user_titles ut
    where ut.profile_id = v_profile and ut.source in ('app', 'solo')
      and case
            when p_segment = 'seen' then ut.seen
            when p_filter = 'all' then ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)
            when p_filter = 'friends' then ut.source = 'app' and (ut.liked_at is not null or ut.picked_at is not null)
            else ut.source = 'solo' and ut.liked_at is not null
          end
  ),
  tiles as (
    select pk.title_id, max(pk.at) as at, bool_or(pk.pick) as is_picked, bool_or(pk.star) as is_super_liked,
           (extract(epoch from max(pk.at)) * 1000000)::bigint as k
    from picked pk group by pk.title_id
  ),
  page as (
    select tl.*, row_number() over (order by tl.k desc, tl.title_id desc) as rn
    from tiles tl
    where v_after_at is null or (tl.k, tl.title_id) < (v_after_at, v_after_id)
    order by tl.k desc, tl.title_id desc
    limit 61
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', t.id,
           'title', coalesce(tr.title, en.title, t.original_title),
           'year', t.release_year,
           'poster_path', coalesce(tr.poster_path, t.poster_path),
           'is_picked', pg.is_picked,
           'is_super_liked', pg.is_super_liked,
           'at', pg.at) order by pg.rn) filter (where pg.rn <= 60), '[]'),
         case when count(*) > 60 then (select x.k || '_' || x.title_id from page x where x.rn = 60) end
  into v_films, v_next
  from page pg
  join public.titles t on t.id = pg.title_id
  left join public.title_translations tr on tr.title_id = t.id and tr.language = v_lang
  left join public.title_translations en on en.title_id = t.id and en.language = 'en';

  return jsonb_build_object('status', 'ok', 'films', v_films, 'next_cursor', v_next);
end
$$;
revoke execute on function api.my_films(text, text, text, text) from public, anon;
grant execute on function api.my_films(text, text, text, text) to authenticated;

-- The film sheet's card: only a film in the caller's own app or solo rows, so it never opens the catalog.
create function api.my_film_card(p_title_id bigint, p_language text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_rows integer;
  v_seen boolean;
  v_liked boolean;
  v_card jsonb;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('my_film_card:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select count(*), coalesce(bool_or(ut.seen), false),
         coalesce(bool_or(ut.liked_at is not null or (ut.source = 'app' and ut.picked_at is not null)), false)
  into v_rows, v_seen, v_liked
  from public.user_titles ut
  where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo');
  if v_rows = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;

  v_card := internal.profile_card_payloads(
    v_profile, p_title_id,
    coalesce(p_language, (select p.language from public.profiles p where p.id = v_profile), 'en'));
  if v_card is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok', 'card', v_card, 'seen', v_seen, 'liked', v_liked);
end
$$;
revoke execute on function api.my_film_card(bigint, text) from public, anon;
grant execute on function api.my_film_card(bigint, text) to authenticated;

-- Mark as seen (only a film already in the caller's rows) or Not seen (clears the app and solo marks,
-- so the film can come back to decks; Letterboxd and calibration rows stay).
create function api.set_film_seen(p_title_id bigint, p_seen boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if p_seen is null then
    raise exception 'seen needs a value' using errcode = '22023';
  end if;
  if not internal.rate_limit('film_edit:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if p_seen then
    if not exists (select 1 from public.user_titles ut
                   where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo')) then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.user_titles as ut (profile_id, title_id, source, seen, seen_at)
    values (v_profile, p_title_id, 'app', true, now())
    on conflict (profile_id, title_id, source) do update
      set seen = true, seen_at = coalesce(ut.seen_at, now()), updated_at = now()
      where not ut.seen;
  else
    if not exists (select 1 from public.user_titles ut
                   where ut.profile_id = v_profile and ut.title_id = p_title_id
                     and ut.source in ('app', 'solo') and ut.seen) then
      return jsonb_build_object('status', 'not_found');
    end if;
    update public.user_titles ut
    set seen = false, seen_at = null, updated_at = now()
    where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo') and ut.seen;
    perform internal.prune_film_rows(v_profile, p_title_id);
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;
revoke execute on function api.set_film_seen(bigint, boolean) from public, anon;
grant execute on function api.set_film_seen(bigint, boolean) to authenticated;

-- Remove from Liked: clears the like, the star and the pick on the caller's app and solo rows. The seen
-- mark stays; a row left with nothing goes. A game's votes are never touched.
create function api.remove_my_film(p_title_id bigint) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_changed integer;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if not internal.rate_limit('film_edit:p:' || v_profile, 60, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update public.user_titles ut
  set liked_at = null, super_liked = false, picked_at = null, updated_at = now()
  where ut.profile_id = v_profile and ut.title_id = p_title_id and ut.source in ('app', 'solo')
    and (ut.liked_at is not null or ut.super_liked or ut.picked_at is not null);
  get diagnostics v_changed = row_count;
  if v_changed = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  perform internal.prune_film_rows(v_profile, p_title_id);
  return jsonb_build_object('status', 'ok');
end
$$;
revoke execute on function api.remove_my_film(bigint) from public, anon;
grant execute on function api.remove_my_film(bigint) to authenticated;

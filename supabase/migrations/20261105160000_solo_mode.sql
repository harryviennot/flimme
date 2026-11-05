-- M6.40: the solo game mode (game-modes.md#the-modes "Solo", solo-and-my-films.md section 4).
-- A room with one seat, opened and started by api.start_solo; nobody can join it or learn it
-- exists; no match check, shortlist or finale; api.solo_pick records the pick; leaving or 30
-- minutes without a vote ends it; the deal skips films answered in earlier solo rooms.
-- Replaced whole from their latest versions: internal.deck_candidates (20261103164752),
-- internal.maybe_start_finale (20261104213000), internal.sweep_room (20261104224803), api.join_room
-- and api.room_preview (20261103190000), api.leave_room (20261103173711). The rest is new.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- is_active false keeps api.create_room answering unknown_mode; api.start_solo reads the row
-- whatever its flag. No match_rules rows: rooms.rule stays null (no card count, no time limit).
insert into public.game_modes (slug, min_players, max_players, ends_on_first_match, defaults, is_active, sort)
values ('solo', 1, 1, false, '{"seen_rule": "hide_seen"}', false, 4)
on conflict (slug) do nothing;

-- Solo rooms skip films answered in earlier solo rooms (M6.40). Same signature and return type.
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

-- A solo room never opens a finale (M6.40).
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
  -- A solo room has no finale: one seat done with a like is not a reason to open one.
  if v_room.state <> 'swiping' or v_room.mode = 'solo' then
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

-- One room's checks, at most one action per run, in this order: close an expired round; abandon
-- (fewer than two heard from, or the one-hour limit with nothing liked); the one-hour finale; the
-- room's own finale rules; the everyone-done ending with no pick. A swiping solo room has one row
-- of its own (ended, 30 minutes without a swipe) and nothing else. Answers what it did: abandoned,
-- host_changed, dealt, finale, no_pick, closed_round, rechecked, ended, locked (another transaction
-- holds the room, the next run gets it) or nothing.
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

  -- A swiping solo room has one seat and no finale: it ends done (no pick) when its latest swipe
  -- (a vote or an undo; the heartbeat does not count), else its start, is 30 minutes old. None of
  -- the rows below applies to it.
  if v_room.mode = 'solo' then
    if coalesce((select max(s.created_at) from public.swipe_log s where s.room_id = p_room_id), v_room.started_at)
         < now() - interval '30 minutes' then
      update public.rooms set state = 'done', ended_at = now() where id = p_room_id;
      perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
      return 'ended';
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

-- A solo room is invisible to join_room (M6.40).
create or replace function api.join_room(
  p_code text,
  p_ref uuid default null,
  p_via text default null,
  p_link_opened_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_member_id uuid;
  v_ip text;
  v_seats integer;
  v_account_id uuid;
  v_via public.join_via;
  v_link_at timestamptz;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  -- An unknown via raises before any limit counts (22023); no via stores null.
  if p_via is not null then
    begin
      v_via := p_via::public.join_via;
    exception when invalid_text_representation then
      raise exception 'unknown via' using errcode = '22023';
    end;
  end if;

  if not internal.rate_limit('join:p:' || v_profile.id, 10, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- Per address (gap 7): 30 attempts per 10 minutes, which a party on one Wi-Fi never reaches.
  -- No address (the server, the SQL editor): only the per-profile limits apply.
  v_ip := internal.request_ip_key();
  if v_ip is not null and not internal.rate_limit('join:ip:' || v_ip, 30, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- Failed attempts count more: peek here, count only a not_found below.
  if not internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes', false) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_room from public.rooms
  where code = p_code and state in ('lobby', 'dealing', 'swiping', 'finale')
    and mode <> 'solo'      -- a solo room is invisible: the same answers as a code nobody holds
  for no key update;
  -- A link for a room that has ended (or whose code another room now holds): closed,
  -- counted as a failed attempt like not_found.
  if p_ref is not null and (not found or v_room.id <> p_ref) then
    perform internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes');
    return jsonb_build_object('status', 'closed');
  end if;
  if not found then
    perform internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes');
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Removed by the host: no way back, by code or by link. Not a failed attempt, and
  -- nothing is written (no sync request, no last_seen_at, no rejoin).
  if exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is not null
  ) then
    return jsonb_build_object('status', 'removed');
  end if;

  -- Locked by the host: no new seats, by code or by link. A seat that exists (one that left)
  -- still gets back in below. Not a failed attempt, and nothing is written.
  if v_room.locked and not exists (
    select 1 from public.room_members where room_id = v_room.id and profile_id = v_profile.id
  ) then
    return jsonb_build_object('status', 'locked');
  end if;

  -- Fresh Letterboxd data for tonight: sync if the last one is over 6 hours old.
  update public.profiles set last_seen_at = now() where id = v_profile.id;
  for v_account_id in
    update public.linked_accounts la
    set sync_requested_at = now()
    where la.profile_id = v_profile.id
      and (la.last_synced_at is null or la.last_synced_at < now() - interval '6 hours')
      and (la.sync_requested_at is null or la.sync_requested_at < now() - interval '10 minutes')
    returning la.id
  loop
    perform internal.enqueue('letterboxd_sync', jsonb_build_object(
      'linked_account_id', v_account_id, 'reason', 'joined_room'));
  end loop;

  -- Rejoin after a dropped connection or an app restart: same seat.
  select id into v_member_id from public.room_members
  where room_id = v_room.id and profile_id = v_profile.id;
  if found then
    update public.room_members set left_at = null, last_active_at = now() where id = v_member_id;
    -- No seat holds the host role (the host left and nobody took over): this player does,
    -- so the room can be unlocked and started. Nobody else is seated, so no broadcast (Q23.3).
    if not exists (
      select 1 from public.room_members
      where room_id = v_room.id and role = 'host' and left_at is null
    ) then
      update public.room_members set role = 'host' where id = v_member_id;
      update public.rooms set host_id = v_profile.id where id = v_room.id;
    end if;
    return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                              'state', v_room.state, 'rejoined', true);
  end if;

  if v_room.state = 'dealing' then
    return jsonb_build_object('status', 'starting');    -- try again in a second
  end if;
  if v_room.state = 'finale' then
    return jsonb_build_object('status', 'in_finale');
  end if;
  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required', 'host_name',
      (select m.display_name from public.room_members m where m.room_id = v_room.id and m.role = 'host' limit 1));
  end if;

  select count(*) into v_seats from public.room_members where room_id = v_room.id and left_at is null;
  if v_seats >= v_room.max_players then
    return jsonb_build_object('status', 'full', 'max_players', v_room.max_players);
  end if;

  -- Only a link has an opening time, between the room's creation and now.
  if v_via = 'link' and p_link_opened_at is not null then
    v_link_at := least(greatest(p_link_opened_at, v_room.created_at), now());
  end if;

  insert into public.room_members (room_id, profile_id, controlled_by, display_name, avatar_key, provider_ids,
                                   joined_via, link_opened_at)
  values (
    v_room.id, v_profile.id, v_profile.id, v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}'),
    v_via, v_link_at
  )
  returning id into v_member_id;

  -- Late joiner: deal them the shared opening now, and the rest from the
  -- server, or under deck_engine 'sql' from the baseline below.
  if v_room.state = 'swiping' then
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score)
    select distinct on (d.title_id) d.room_id, v_member_id, d.title_id, d.sort_key, 'opening', d.score
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id
    where d.room_id = v_room.id and d.source = 'opening' and c.state = 'active';
    if internal.deck_engine() <> 'sql' then
      update public.room_members set refill_requested_at = now() where id = v_member_id;
      perform internal.enqueue('deck_requests', jsonb_build_object(
        'kind', 'refill', 'room_id', v_room.id, 'room_member_id', v_member_id));
    end if;
  end if;

  perform internal.refresh_room_providers(v_room.id);
  -- After the refresh, so the baseline sees the joiner's services, as the server would.
  if v_room.state = 'swiping' and internal.deck_engine() = 'sql' then
    perform internal.deal_baseline(v_room.id, v_member_id);
  end if;
  perform internal.broadcast_room(v_room.id, 'member_joined', jsonb_build_object(
    'member_id', v_member_id, 'display_name', v_profile.display_name, 'avatar_key', v_profile.avatar_key));

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                            'state', v_room.state, 'rejoined', false);
end
$$;

-- A solo room is invisible to room_preview (M6.40).
create or replace function api.room_preview(p_code text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_ip text;
  v_players integer;
  v_seated boolean;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  -- No reference, no preview: raises before any limit counts.
  if p_code is null or p_ref is null then
    raise exception 'code and ref are required' using errcode = '22023';
  end if;

  if not internal.rate_limit('preview:p:' || v_profile.id, 10, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  v_ip := internal.request_ip_key();
  if v_ip is not null and not internal.rate_limit('preview:ip:' || v_ip, 30, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_room from public.rooms
  where code = p_code and id = p_ref and state in ('lobby', 'dealing', 'swiping', 'finale')
    and mode <> 'solo';     -- a solo room answers as a room that does not exist
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is not null
  ) then
    return jsonb_build_object('status', 'removed');
  end if;

  select count(*) into v_players from public.room_members
  where room_id = v_room.id and left_at is null;
  select exists (
    select 1 from public.room_members
    where room_id = v_room.id and profile_id = v_profile.id and removed_at is null
  ) into v_seated;

  -- A seated caller goes straight back in, whatever the state or count (as join_room's rejoin).
  if not v_seated then
    if v_room.locked then
      return jsonb_build_object('status', 'locked');
    end if;
    if v_room.state = 'finale' then
      return jsonb_build_object('status', 'in_finale');
    end if;
    if v_players >= v_room.max_players then
      return jsonb_build_object('status', 'full', 'max_players', v_room.max_players);
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'state', v_room.state,
    'host_name', (select m.display_name from public.room_members m
                  where m.room_id = v_room.id and m.role = 'host' limit 1),
    'host_avatar_key', (select m.avatar_key from public.room_members m
                        where m.room_id = v_room.id and m.role = 'host' limit 1),
    'players', v_players,
    'max_players', v_room.max_players,
    'seated', v_seated
  );
end
$$;

-- Leaving a solo room ends it (M6.40).
create or replace function api.leave_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_next uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id and m.profile_id = internal.my_profile_id() and m.left_at is null;
  if not found then
    return jsonb_build_object('status', 'not_in_room');
  end if;

  update public.room_members set left_at = now() where id = v_member.id;

  -- A solo room ends with its only player: done (no pick) once it was swiping, abandoned before.
  -- Nobody else is there to tell, so no member_left and no recheck.
  if v_room.mode = 'solo' then
    if v_room.state = 'swiping' then
      update public.rooms set state = 'done', ended_at = now() where id = p_room_id;
      perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
    elsif v_room.state in ('lobby', 'dealing') then
      perform internal.abandon_room(p_room_id);
    end if;
    return jsonb_build_object('status', 'ok');
  end if;

  if v_member.role = 'host' then
    v_next := internal.next_host_member(p_room_id);
    update public.room_members set role = 'guest' where id = v_member.id;
    if v_next is not null then
      update public.room_members set role = 'host' where id = v_next;
      update public.rooms set host_id = (select profile_id from public.room_members where id = v_next)
      where id = p_room_id;
    end if;
  end if;

  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'member_left', jsonb_build_object(
    'member_id', v_member.id, 'new_host_member_id', v_next));

  if v_room.state = 'swiping' then
    perform internal.recheck_room_matches(p_room_id);
  end if;

  return jsonb_build_object('status', 'ok');
end
$$;

-- Opens and starts a solo room in one call: no lobby, no invite, no host handover. The caller's
-- other live solo room ends first, as leave_room would end it. The start runs through
-- api.start_game unchanged. Under deck_engine 'server' the answer is dealing and the phone follows
-- state_changed. Fewer than 20 films: the new room is abandoned (not back in the lobby).
create function api.start_solo(p_settings jsonb default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_mode public.game_modes;
  v_room public.rooms;
  v_member_id uuid;
  v_field text;
  v_old uuid;
  v_start jsonb;
  i integer;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  if not internal.rate_limit('solo_start:p:' || v_profile.id, 20, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required');
  end if;
  if v_profile.country is null then
    return jsonb_build_object('status', 'country_required');
  end if;

  if p_settings is not null then
    v_field := internal.room_settings_error(p_settings);
    if v_field is null and p_settings ? 'seen_rule' and p_settings->>'seen_rule' is distinct from 'hide_seen' then
      v_field := 'seen_rule';
    end if;
    if v_field is not null then
      return jsonb_build_object('status', 'invalid_settings', 'field', v_field);
    end if;
  end if;

  select * into v_mode from public.game_modes where slug = 'solo';

  -- One solo session at a time.
  for v_old in
    select r.id from public.rooms r
    join public.room_members m on m.room_id = r.id and m.profile_id = v_profile.id and m.left_at is null
    where r.mode = 'solo' and r.state in ('lobby', 'dealing', 'swiping')
  loop
    perform api.leave_room(v_old);
  end loop;

  for i in 1..10 loop
    begin
      insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, quality,
                                service_rule, reveal, runtime_max, max_age)
      values (
        internal.new_room_code(),
        v_profile.id, v_mode.slug, v_profile.country, v_mode.max_players, 'hide_seen',
        coalesce((p_settings->>'quality')::public.quality_preset, 'standard'),
        'any_member',
        coalesce((p_settings->>'reveal')::public.reveal_mode, 'party'),
        trunc((p_settings->>'runtime_max')::numeric)::smallint,
        trunc((p_settings->>'max_age')::numeric)::smallint
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if i = 10 then raise; end if;
    end;
  end loop;

  -- No limit on super likes alone (smallint's top); api.cast_vote stays as it is.
  insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key,
                                   provider_ids, super_likes_left)
  values (
    v_room.id, v_profile.id, v_profile.id, 'host', v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}'),
    32767
  )
  returning id into v_member_id;
  insert into public.room_models (room_id) values (v_room.id);
  perform internal.refresh_room_providers(v_room.id);

  v_start := api.start_game(v_room.id);
  case v_start->>'status'
    when 'ok' then
      return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id, 'state', 'swiping');
    when 'dealing' then
      return jsonb_build_object('status', 'dealing', 'room_id', v_room.id, 'member_id', v_member_id);
    when 'too_few_films' then
      perform internal.abandon_room(v_room.id);
      return jsonb_build_object('status', 'too_few_films', 'eligible', v_start->'eligible');
    else
      raise exception 'unexpected start answer %', v_start->>'status';
  end case;
end
$$;

revoke execute on function api.start_solo(jsonb) from public, anon;
grant execute on function api.start_solo(jsonb) to authenticated;

-- Records a film the player liked or super liked in this solo room as the room's pick, and ends
-- the room. A retry for the same film once done answers ok.
create function api.solo_pick(p_room_id uuid, p_title_id bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    raise exception 'room not found' using errcode = '42501';
  end if;

  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id and m.profile_id = internal.my_profile_id()
    and m.left_at is null and m.removed_at is null;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if v_room.mode <> 'solo' then
    raise exception 'not a solo room' using errcode = '22023';
  end if;

  if v_room.state = 'done' and exists (
    select 1 from public.matches x where x.room_id = p_room_id and x.pick_order = 1 and x.title_id = p_title_id
  ) then
    return jsonb_build_object('status', 'ok', 'title_id', p_title_id);
  end if;
  if v_room.state <> 'swiping' then
    return jsonb_build_object('status', 'closed', 'state', v_room.state);
  end if;

  if not exists (
    select 1 from public.votes v
    where v.room_member_id = v_member.id and v.title_id = p_title_id and v.answer in ('like', 'super_like')
  ) then
    return jsonb_build_object('status', 'not_liked');
  end if;

  update public.room_cards set state = 'matched' where room_id = p_room_id and title_id = p_title_id;
  insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
  values (p_room_id, p_title_id, 'unanimous', 1, 1, 1);
  update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = p_room_id;
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'done'));
  return jsonb_build_object('status', 'ok', 'title_id', p_title_id);
end
$$;

revoke execute on function api.solo_pick(uuid, bigint) from public, anon;
grant execute on function api.solo_pick(uuid, bigint) to authenticated;

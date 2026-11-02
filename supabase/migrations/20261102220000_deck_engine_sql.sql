-- M1.13: the deck_engine setting. With `sql` (the first release, no deck worker
-- running), starting a game, a vote at 15 cards left, a late joiner and
-- request_cards deal the SQL baseline at once instead of queueing for the
-- server and waiting 8 seconds. With `server`, or no key, nothing changes.
-- Also adds tmdb_image_base, so no build hard-codes the image host.
-- invite_base_url waits for the domain (M0.2).
--
-- start_game and request_cards come from the baseline (nothing replaced them
-- since); cast_vote from M1.11 (input_limits_and_crypto_codes), join_room from
-- M1.9 (rate_limit_helper). Each is whole, with only the deck_engine branch added.
-- deal_baseline (baseline) is replaced too, with one fix: an empty deal no
-- longer raises (see its comment).

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- An existing value is kept: staging or production may have switched already.
insert into public.app_config (key, value) values
  ('deck_engine', '"sql"'),
  ('tmdb_image_base', '"https://image.tmdb.org/t/p/"')
on conflict (key) do nothing;

-- Who deals: 'sql' (the baseline, at once) or 'server' (the deck worker, through
-- deck_requests). A missing key, or any other value, means 'server'.
create function internal.deck_engine() returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select c.value #>> '{}' from public.app_config c where c.key = 'deck_engine'), 'server')
$$;
revoke execute on function internal.deck_engine() from public, anon, authenticated;

-- Host taps start. Under deck_engine 'sql' the baseline deals now and the
-- answer is deal_baseline's ok (started, no fallback field). Under 'server'
-- the server deals; if it has not within 8 seconds, the host's phone calls
-- this again and the SQL baseline deals instead.
create or replace function api.start_game(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_min smallint;
begin
  select r.* into v_room from public.rooms r
  where r.id = p_room_id
    and exists (select 1 from public.room_members m
                where m.room_id = r.id and m.role = 'host' and m.profile_id = internal.my_profile_id()
                  and m.left_at is null)
  for no key update;
  if not found then
    raise exception 'only the host can start' using errcode = '42501';
  end if;

  if v_room.state = 'dealing' then
    if now() - v_room.dealing_at > interval '8 seconds' then
      return internal.deal_baseline(p_room_id) || jsonb_build_object('fallback', true);
    end if;
    return jsonb_build_object('status', 'dealing');
  end if;
  if v_room.state <> 'lobby' then
    return jsonb_build_object('status', 'closed', 'state', v_room.state);
  end if;

  select gm.min_players into v_min from public.game_modes gm where gm.slug = v_room.mode;
  if cardinality(internal.present_member_ids(p_room_id)) < v_min then
    return jsonb_build_object('status', 'not_enough_players', 'need', v_min);
  end if;

  update public.rooms set state = 'dealing', dealing_at = now() where id = p_room_id;
  if internal.deck_engine() = 'sql' then
    -- The dealing broadcast stays (Q13.5): swiping follows it from the same commit.
    perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'dealing'));
    return internal.deal_baseline(p_room_id);
  end if;
  perform internal.enqueue('deck_requests', jsonb_build_object('kind', 'start', 'room_id', p_room_id));
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'dealing'));
  return jsonb_build_object('status', 'dealing');
end
$$;

-- The phone is running low and no refill has arrived. Under deck_engine 'sql',
-- deal the SQL baseline now. Under 'server', queue one, or after 8 seconds of
-- silence from the server, deal the SQL baseline now.
create or replace function api.request_cards(p_room_id uuid, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_member public.room_members;
  v_remaining integer;
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

  select count(*) into v_remaining
  from public.deck_entries d
  join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
  where d.room_member_id = v_member.id
    and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id);
  if v_remaining > 5 then
    return jsonb_build_object('status', 'enough', 'remaining', v_remaining);
  end if;

  if internal.deck_engine() = 'sql' then
    return internal.deal_baseline(p_room_id, v_member.id);
  end if;
  if v_member.refill_requested_at is null then
    update public.room_members set refill_requested_at = now() where id = v_member.id;
    perform internal.enqueue('deck_requests', jsonb_build_object(
      'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
    return jsonb_build_object('status', 'queued');
  end if;
  if now() - v_member.refill_requested_at > interval '8 seconds' then
    return internal.deal_baseline(p_room_id, v_member.id) || jsonb_build_object('fallback', true);
  end if;
  return jsonb_build_object('status', 'queued');
end
$$;

create or replace function api.cast_vote(
  p_room_id uuid,
  p_title_id bigint,
  p_answer public.vote_answer,
  p_member_id uuid default null,
  p_dwell_ms integer default null,
  p_client_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_entry public.deck_entries;
  v_card public.room_cards;
  v_check jsonb;
  v_touched uuid[];
  v_round uuid;
  v_remaining integer;
  v_dwell_ms integer;
  v_client_at timestamptz;
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
  if not found then
    raise exception 'card was not dealt to this seat' using errcode = '22023';
  end if;

  if p_answer = 'super_like' and v_member.super_likes_left <= 0 then
    return jsonb_build_object('status', 'no_super_likes');
  end if;

  insert into public.votes (room_id, room_member_id, title_id, answer, client_created_at)
  values (p_room_id, v_member.id, p_title_id, p_answer, v_client_at)
  on conflict (room_member_id, title_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'duplicate');   -- an offline retry of a saved vote
  end if;

  update public.room_members
  set swipe_count = swipe_count + 1,
      last_active_at = now(),
      super_likes_left = super_likes_left - (p_answer = 'super_like')::int
  where id = v_member.id;

  update public.room_cards
  set like_count = like_count + (p_answer = 'like')::int,
      super_like_count = super_like_count + (p_answer = 'super_like')::int,
      nope_count = nope_count + (p_answer = 'nope')::int,
      seen_count = seen_count + (p_answer = 'seen')::int
  where room_id = p_room_id and title_id = p_title_id
  returning * into v_card;

  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer, deck_source, score, dwell_ms)
  values (p_room_id, v_member.id, p_title_id, 'vote', p_answer, v_entry.source, v_entry.score, v_dwell_ms);

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

  if p_answer in ('like', 'super_like') then
    v_check := internal.check_card_match(p_room_id, p_title_id);
    if v_check->>'match' = 'false' then
      if v_room.reveal = 'party' and (v_check->>'likes')::int >= 2 then
        perform internal.broadcast_room(p_room_id, 'near_miss', jsonb_build_object(
          'title_id', p_title_id, 'likes', v_check->'likes', 'of', v_check->'of'));
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
        perform internal.deal_baseline(p_room_id, v_member.id);
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

-- Never raises on a wrong code: an exception would roll back the attempt
-- counter and make the 6-digit space guessable. Limits, in order: 10 attempts
-- per profile and 30 per address per 10 minutes, then 5 not_found per profile.
create or replace function api.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_member_id uuid;
  v_ip text;
  v_seats integer;
  v_account_id uuid;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
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
  for no key update;
  if not found then
    perform internal.rate_limit('join_failed:p:' || v_profile.id, 5, interval '10 minutes');
    return jsonb_build_object('status', 'not_found');
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
    return jsonb_build_object('status', 'name_required');
  end if;

  select count(*) into v_seats from public.room_members where room_id = v_room.id and left_at is null;
  if v_seats >= v_room.max_players then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.room_members (room_id, profile_id, controlled_by, display_name, avatar_key, provider_ids)
  values (
    v_room.id, v_profile.id, v_profile.id, v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}')
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

-- SQL-only dealer, for when the server does not answer in time: the baseline
-- scores, the same order for every seat, the first 10 as the shared opening.
-- M1.13 fix: with no films left to deal, each seat's cards were JSON null and
-- deal_cards raised 22023. Under deck_engine 'sql' that made every vote at 15
-- cards left raise once the catalog ran out, so an empty deal is now an empty
-- list. Everything else is as the baseline wrote it (is_fallback stays true, Q13.3).
create or replace function internal.deal_baseline(p_room_id uuid, p_seat uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_cards jsonb;
begin
  select state into v_state from public.rooms where id = p_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', c.title_id, 'group_score', c.group_score, 'min_fit', c.min_fit,
           'fits', c.fits, 'score', c.group_score) order by c.group_score desc), '[]')
  into v_cards from internal.deck_candidates(p_room_id, 30, 1.0) c;
  if jsonb_array_length(v_cards) < 10 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'title_id', c.title_id, 'group_score', c.group_score, 'min_fit', c.min_fit,
             'fits', c.fits, 'score', c.group_score) order by c.group_score desc), '[]')
    into v_cards from internal.deck_candidates(p_room_id, 30, 0) c;
  end if;

  return internal.deal_cards(p_room_id, jsonb_build_object(
    'request', jsonb_build_object(
      'kind', case when v_state = 'dealing' then 'start' else 'refill' end,
      'model_version', 'sql-baseline', 'is_fallback', true,
      'room_member_id', p_seat, 'candidates', jsonb_array_length(v_cards)),
    'pool', v_cards,
    'decks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'room_member_id', m.id,
        'cards', (select coalesce(jsonb_agg(jsonb_set(x.c, '{source}',
                    to_jsonb(case when v_state = 'dealing' and x.o <= 10 then 'opening' else 'ranked' end))
                    order by x.o), '[]')
                  from jsonb_array_elements(v_cards) with ordinality as x(c, o)))), '[]')
      from public.room_members m
      where m.room_id = p_room_id and m.left_at is null and (p_seat is null or m.id = p_seat))));
end
$$;

-- M6.42: the solo daily cap (game-modes.md#starting-values, solo-and-my-films.md section 8) and
-- solo in the metric views (analytics.md#game).
-- A player gets 100 solo cards a day (app_config.solo_daily_cards, read as 100 when missing or not
-- a number), counted as swipe_log vote rows in their solo seats since Paris midnight. Undo gives
-- nothing back, group rooms are never counted. internal.deal_cards trims a solo seat's new cards
-- to what is left; api.start_solo and api.request_cards answer daily_limit. deal_cards also
-- abandons a solo room that finds fewer than 20 films (it went back to the lobby, which the
-- sweeper ignores). Replaced whole from their latest versions: internal.deal_cards
-- (20261103192245), api.request_cards (20261104213000), api.start_solo (20261105160000), the
-- analytics views (20261105140000).
set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into public.app_config (key, value) values ('solo_daily_cards', '100'::jsonb)
on conflict (key) do nothing;

-- Cards left today: the cap minus the vote rows of the player's solo seats since Paris midnight.
-- May be negative (undo adds a row and deletes none). Not granted to any role.
create function internal.solo_cards_left(p_profile uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(c.value) = 'number' then (c.value #>> '{}')::numeric::int end
                   from public.app_config c where c.key = 'solo_daily_cards'), 100)
         - (select count(*)::int
            from public.room_members m
            join public.rooms r on r.id = m.room_id and r.mode = 'solo'
            join public.swipe_log s on s.room_id = r.id and s.room_member_id = m.id and s.action = 'vote'
            where m.profile_id = p_profile
              and s.created_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
$$;
revoke all on function internal.solo_cards_left(uuid) from public, anon, authenticated;

create or replace function internal.deal_cards(p_room_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_min_films constant integer := 20;   -- game-modes.md#starting-values: too few films to start
  v_state public.room_state;
  v_mode text;
  v_request_id bigint;
  v_deck jsonb;
  v_seat uuid;
  v_seat_profile uuid;
  v_keep integer;
  v_allow integer;
  v_base double precision;
  v_touched uuid[] := '{}';
  v_started boolean := false;
  v_eligible integer;
begin
  select state, mode into v_state, v_mode from public.rooms where id = p_room_id for no key update;
  if not found or v_state not in ('dealing', 'swiping') then
    return jsonb_build_object('status', 'closed');   -- the room moved on; the server drops its result
  end if;

  insert into rec.requests (room_id, room_member_id, kind, model_version, experiment, variant,
                            strategy, candidates, latency_ms, is_fallback)
  select p_room_id, (r->>'room_member_id')::uuid, coalesce(r->>'kind', 'refill'),
         coalesce(r->>'model_version', 'unknown'), r->>'experiment', r->>'variant',
         coalesce(r->'strategy', '{}'), (r->>'candidates')::int, (r->>'latency_ms')::int,
         coalesce((r->>'is_fallback')::boolean, false)
  from (select coalesce(p_payload->'request', '{}') as r) x
  returning id into v_request_id;

  -- M5.5: a start with fewer than 20 eligible films deals nothing. The attempt
  -- stays logged above, with no pool, deck or item rows, and the room goes back
  -- to the lobby so the host can loosen a filter. `candidates` is the size of the
  -- set the dealer drew from (before the misery line); without it, the pool stands in.
  -- Only a start: a refill or a late joiner's deal gives whatever there is.
  -- M6.42: a solo room has no lobby to go back to (nobody can loosen a filter there and the
  -- sweeper ignores lobby rows): it is abandoned, as api.start_solo does.
  if v_state = 'dealing' then
    v_eligible := coalesce((p_payload->'request'->>'candidates')::int,
                           jsonb_array_length(coalesce(p_payload->'pool', '[]')));
    if v_eligible < c_min_films then
      if v_mode = 'solo' then
        perform internal.abandon_room(p_room_id);
      else
        update public.rooms set state = 'lobby', dealing_at = null where id = p_room_id;
        perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object(
          'state', 'lobby', 'reason', 'too_few_films', 'eligible', v_eligible));
      end if;
      return jsonb_build_object('status', 'too_few_films', 'eligible', v_eligible);
    end if;
  end if;

  -- New films join the pool; films already in it take the new scores while still active.
  insert into public.room_cards as c (room_id, title_id, source, group_score, min_fit, fits,
                                      reason_code, reason_params, member_ratings)
  select p_room_id, (p->>'title_id')::bigint, coalesce(p->>'source', 'ranked')::public.card_source,
         (p->>'group_score')::real, (p->>'min_fit')::real, coalesce(p->'fits', '{}'),
         p->>'reason_code', coalesce(p->'reason_params', '{}'), coalesce(p->'member_ratings', '[]')
  from jsonb_array_elements(coalesce(p_payload->'pool', '[]')) p
  on conflict (room_id, title_id) do update
    set group_score = excluded.group_score, min_fit = excluded.min_fit, fits = excluded.fits,
        reason_code = excluded.reason_code, reason_params = excluded.reason_params,
        member_ratings = excluded.member_ratings
    where c.state = 'active';

  for v_deck in select d from jsonb_array_elements(coalesce(p_payload->'decks', '[]')) d loop
    v_seat := (v_deck->>'room_member_id')::uuid;
    select m.profile_id into v_seat_profile from public.room_members m where m.id = v_seat and m.room_id = p_room_id;
    if not found then
      continue;
    end if;
    v_keep := (v_deck->>'keep')::int;

    -- Re-rank: keep the next `keep` cards (the phone has them mounted) and
    -- cards moved up by a like; replace the rest of the upcoming deck.
    if v_keep is not null then
      delete from public.deck_entries d
      where d.room_member_id = v_seat
        and d.source <> 'propagated'
        and not exists (select 1 from public.votes v where v.room_member_id = v_seat and v.title_id = d.title_id)
        and d.title_id not in (
          select u.title_id from public.deck_entries u
          where u.room_member_id = v_seat
            and not exists (select 1 from public.votes v where v.room_member_id = v_seat and v.title_id = u.title_id)
          order by u.sort_key
          limit v_keep);
    end if;

    -- M6.42: a solo seat gets at most the cards it has left today: the cap, minus the answered
    -- cards, minus the cards it still holds. Group rooms are never capped (null: no limit).
    v_allow := null;
    if v_mode = 'solo' and v_seat_profile is not null then
      v_allow := greatest(0, internal.solo_cards_left(v_seat_profile) - internal.unanswered_count(v_seat));
    end if;

    select coalesce(max(d.sort_key), 0) into v_base from public.deck_entries d where d.room_member_id = v_seat;

    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score, request_id)
    select p_room_id, v_seat, (x.c->>'title_id')::bigint, v_base + x.o,
           coalesce(x.c->>'source', 'ranked')::public.deck_source, (x.c->>'score')::real, v_request_id
    from jsonb_array_elements(v_deck->'cards') with ordinality as x(c, o)
    join public.room_cards rc on rc.room_id = p_room_id and rc.title_id = (x.c->>'title_id')::bigint
                              and rc.state = 'active'
    where not exists (select 1 from public.votes v
                      where v.room_member_id = v_seat and v.title_id = (x.c->>'title_id')::bigint)
    order by x.o
    limit v_allow
    on conflict (room_member_id, title_id) do nothing;

    insert into rec.request_items (request_id, room_member_id, title_id, position, score, explore, propensity, features)
    select v_request_id, v_seat, (x.c->>'title_id')::bigint, x.o::smallint, (x.c->>'score')::real,
           coalesce((x.c->>'explore')::boolean, false), (x.c->>'propensity')::real, coalesce(x.c->'features', '{}')
    from jsonb_array_elements(v_deck->'cards') with ordinality as x(c, o)
    on conflict do nothing;

    update public.room_members set refill_requested_at = null where id = v_seat;
    v_touched := v_touched || v_seat;
  end loop;

  if v_state = 'dealing' then
    perform internal.begin_swiping(p_room_id);
    v_started := true;
  elsif cardinality(v_touched) > 0 then
    perform internal.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
  end if;

  return jsonb_build_object('status', 'ok', 'request_id', v_request_id, 'started', v_started,
                            'seats', cardinality(v_touched));
end
$$;

-- In a solo room, a seat with no card left to be dealt today and 5 or fewer unanswered cards
-- answers daily_limit (before done); above 5 it is enough, as everywhere. Group rooms: unchanged.
create or replace function api.request_cards(p_room_id uuid, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_mode text;
  v_member public.room_members;
  v_remaining integer;
  v_deal jsonb;
begin
  select state, mode into v_state, v_mode from public.rooms where id = p_room_id for no key update;
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
  if v_mode = 'solo' and v_member.profile_id is not null
     and internal.solo_cards_left(v_member.profile_id) - v_remaining <= 0 then
    return jsonb_build_object('status', 'daily_limit');
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

-- Same as M6.40's, plus daily_limit when no card is left today, before anything is created.
create or replace function api.start_solo(p_settings jsonb default null) returns jsonb
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

  -- The day's cards are used up: nothing is created (the player's live room, if any, stays).
  if internal.solo_cards_left(v_profile.id) <= 0 then
    return jsonb_build_object('status', 'daily_limit');
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
      -- deal_cards abandons a solo room itself now; end it here only if the start did not.
      if (select r.state from public.rooms r where r.id = v_room.id) <> 'abandoned' then
        perform internal.abandon_room(v_room.id);
      end if;
      return jsonb_build_object('status', 'too_few_films', 'eligible', v_start->'eligible');
    else
      raise exception 'unexpected start answer %', v_start->>'status';
  end case;
end
$$;

-- The metric views leave solo rooms out of the group numbers (a solo room is neither a first
-- game nor a return) and show solo on its own in analytics.solo_sessions. Same columns as before.
create or replace view analytics.time_to_pick as
select (r.started_at at time zone 'UTC')::date as day,
       r.country::text as country,
       r.mode,
       analytics.group_size((r.stats->>'players')::integer) as group_size,
       count(*) as rooms,
       percentile_cont(0.5) within group (order by extract(epoch from r.decided_at - r.started_at)) as median_seconds,
       percentile_cont(0.9) within group (order by extract(epoch from r.decided_at - r.started_at)) as p90_seconds
from public.rooms r
where r.started_at is not null
  and r.decided_at is not null
  and r.mode <> 'solo'
  and r.stats->>'outcome' in ('match', 'finale')
group by 1, 2, 3, 4;

create or replace view analytics.room_outcomes as
select (r.started_at at time zone 'UTC')::date as day,
       r.country::text as country,
       r.mode,
       analytics.group_size((r.stats->>'players')::integer) as group_size,
       count(*) as started,
       count(*) filter (where r.stats is null) as pending,
       count(*) filter (where r.stats->>'outcome' = 'match') as match,
       count(*) filter (where r.stats->>'outcome' = 'finale') as finale,
       count(*) filter (where r.stats->>'outcome' = 'no_pick') as no_pick,
       count(*) filter (where r.stats->>'outcome' = 'abandoned') as abandoned,
       count(*) filter (where r.stats->>'outcome' in ('match', 'finale')
                          and r.decided_at - r.started_at < interval '5 minutes') as picks_within_5_min,
       (count(*) filter (where r.stats->>'outcome' in ('match', 'finale')))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as pick_share,
       (count(*) filter (where r.stats->>'outcome' = 'no_pick'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as no_pick_share,
       (count(*) filter (where r.stats->>'outcome' = 'abandoned'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as abandoned_share,
       (count(*) filter (where r.stats->>'outcome' in ('match', 'finale')
                           and r.decided_at - r.started_at < interval '5 minutes'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as pick_within_5_min_share,
       (count(*) filter (where r.stats->>'outcome' = 'match'))::numeric
         / nullif(count(*) filter (where r.stats->>'outcome' in ('match', 'finale')), 0) as instant_match_share
from public.rooms r
where r.started_at is not null
  and r.mode <> 'solo'
group by 1, 2, 3, 4;

-- A profile's first seat in a started room may be a solo one: its entry is then solo.
create or replace view analytics.onboarding_time as
with first_seat as (
  select distinct on (m.profile_id) m.profile_id, m.id as seat_id, m.role, m.joined_via, r.mode
  from public.room_members m
  join public.rooms r on r.id = m.room_id and r.started_at is not null
  where m.profile_id is not null
  order by m.profile_id, m.joined_at, m.id
),
first_vote as (
  select s.profile_id,
         case when s.mode = 'solo' then 'solo'
              when s.role = 'host' then 'host'
              when s.role = 'guest' and s.joined_via = 'link' then 'guest_link'
              when s.role = 'guest' and s.joined_via in ('code', 'qr') then 'guest_code' end as entry,
         (select min(l.created_at) from public.swipe_log l where l.room_member_id = s.seat_id and l.action = 'vote') as voted_at
  from first_seat s
)
select (date_trunc('week', p.created_at at time zone 'UTC'))::date as week,
       coalesce(p.country::text, 'unknown') as country,
       f.entry,
       count(*) as players,
       percentile_cont(0.5) within group (order by extract(epoch from f.voted_at - p.created_at)) as median_seconds
from first_vote f
join public.profiles p on p.id = f.profile_id
where f.entry is not null and f.voted_at is not null and p.managed_by is null
group by 1, 2, 3;

-- Solo rooms are neither a first game nor a return.
create or replace view analytics.second_game as
with first_seat as (
  select distinct on (m.profile_id) m.profile_id, m.room_id, m.joined_at, r.started_at
  from public.room_members m
  join public.rooms r on r.id = m.room_id and r.started_at is not null and r.mode <> 'solo'
  where m.profile_id is not null
  order by m.profile_id, m.joined_at, m.id
),
cohort as (
  select f.*,
         exists (
           select 1
           from public.room_members m2
           join public.rooms r2 on r2.id = m2.room_id and r2.started_at is not null and r2.mode <> 'solo'
           where m2.profile_id = f.profile_id
             and m2.room_id <> f.room_id
             and r2.started_at > f.started_at
             and r2.started_at <= f.joined_at + interval '14 days'
         ) as returned
  from first_seat f
)
select (date_trunc('week', c.joined_at at time zone 'UTC'))::date as cohort_week,
       count(*) as new_players,
       count(*) filter (where c.returned) as returned,
       (count(*) filter (where c.returned))::numeric / count(*) as share,
       (date_trunc('week', c.joined_at at time zone 'UTC') + interval '21 days' < now() at time zone 'UTC') as is_complete
from cohort c
group by date_trunc('week', c.joined_at at time zone 'UTC');

-- Solo on its own: started solo rooms by UTC day of started_at and country.
create view analytics.solo_sessions as
select (r.started_at at time zone 'UTC')::date as day,
       r.country::text as country,
       count(*) as sessions,
       percentile_cont(0.5) within group (order by coalesce(m.swipe_count, 0)) as median_cards,
       count(*) filter (where r.stats->>'outcome' = 'match') as picks,
       (count(*) filter (where r.stats->>'outcome' = 'match'))::numeric
         / nullif(count(*) filter (where r.stats is not null), 0) as pick_share
from public.rooms r
left join lateral (
  select max(x.swipe_count) as swipe_count from public.room_members x where x.room_id = r.id
) m on true
where r.mode = 'solo' and r.started_at is not null
group by 1, 2;
comment on view analytics.solo_sessions is
  'M6.42. Started solo rooms by UTC day of started_at and country. sessions; median_cards (median swipe_count of the seat); picks (outcome match); pick_share is picks out of rooms with stats. Solo rooms are in none of the other views, except onboarding_time (entry solo).';

revoke all on analytics.solo_sessions from public;

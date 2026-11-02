-- M1.9: one rate limit helper, per profile and per address (security gaps 6 and 7).
-- internal.rate_limit counts hits in fixed windows; internal.request_ip_key reads
-- the client address. join_room, submit_calibration and export_my_data use them.
-- Key format change: 'join:<profile id>' becomes 'join:p:<profile id>'; the old
-- rows are at most 10 minutes of counters and age out on their own.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Counts one hit (p_count) in the fixed window of p_window that contains now(),
-- windows aligned to the epoch, and says whether the hit is within p_max. With
-- p_count false nothing is counted: it says whether one more hit would be allowed.
-- Callers answer a refusal, they never raise, so the count is not rolled back.
create function internal.rate_limit(
  p_key text, p_max integer, p_window interval, p_count boolean default true
) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_seconds double precision := extract(epoch from p_window);
  v_start timestamptz;
  v_hits integer;
begin
  if v_seconds is null or v_seconds <= 0 then
    raise exception 'rate_limit: the window must be positive';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / v_seconds) * v_seconds);

  if p_count then
    insert into public.rate_limits as rl (key, window_start, hits)
    values (p_key, v_start, 1)
    on conflict (key, window_start) do update set hits = rl.hits + 1
    returning hits into v_hits;
    return v_hits <= p_max;
  end if;

  select rl.hits into v_hits from public.rate_limits rl
  where rl.key = p_key and rl.window_start = v_start;
  return coalesce(v_hits, 0) < p_max;
end
$$;
revoke execute on function internal.rate_limit(text, integer, interval, boolean) from public, anon, authenticated;

-- The client address as a key: sha-256 of the normalised address, never the
-- address itself (privacy.md, Rate limits). Null when the request has none.
-- Q9.2: cf-connecting-ip when present, else the LAST x-forwarded-for entry (the
-- one the platform appends), never the first, which a client can forge.
-- IPv6 is keyed by its /64, and an IPv4-mapped IPv6 address by its IPv4.
create function internal.request_ip_key() returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_headers jsonb;
  v_raw text;
  v_parts text[];
  v_ip inet;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_headers is null or jsonb_typeof(v_headers) <> 'object' then
    return null;
  end if;

  v_raw := nullif(btrim(v_headers->>'cf-connecting-ip'), '');
  if v_raw is null then
    v_parts := string_to_array(coalesce(v_headers->>'x-forwarded-for', ''), ',');
    if coalesce(array_length(v_parts, 1), 0) > 0 then
      v_raw := nullif(btrim(v_parts[array_length(v_parts, 1)]), '');
    end if;
  end if;
  if v_raw is null then
    return null;
  end if;

  begin
    v_ip := v_raw::inet;
  exception when others then
    return null;
  end;
  if family(v_ip) = 6 then
    if v_ip << '::ffff:0:0/96'::inet then
      v_ip := regexp_replace(host(v_ip), '^::ffff:', '')::inet;
    else
      v_ip := network(set_masklen(v_ip, 64));
    end if;
  end if;

  return encode(extensions.digest('ip:' || host(v_ip) || '/' || masklen(v_ip), 'sha256'), 'hex');
end
$$;
revoke execute on function internal.request_ip_key() from public, anon, authenticated;

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

  -- Late joiner: deal them the shared opening now, and ask the server for the rest.
  if v_room.state = 'swiping' then
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score)
    select distinct on (d.title_id) d.room_id, v_member_id, d.title_id, d.sort_key, 'opening', d.score
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id
    where d.room_id = v_room.id and d.source = 'opening' and c.state = 'active';
    update public.room_members set refill_requested_at = now() where id = v_member_id;
    perform internal.enqueue('deck_requests', jsonb_build_object(
      'kind', 'refill', 'room_id', v_room.id, 'room_member_id', v_member_id));
  end if;

  perform internal.refresh_room_providers(v_room.id);
  perform internal.broadcast_room(v_room.id, 'member_joined', jsonb_build_object(
    'member_id', v_member_id, 'display_name', v_profile.display_name, 'avatar_key', v_profile.avatar_key));

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                            'state', v_room.state, 'rejoined', false);
end
$$;
-- 10 taste check submissions per profile per hour. Refused: rate_limited, nothing saved or queued.
create or replace function api.submit_calibration(p_answers jsonb, p_room_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
  v_seat uuid;
  v_saved integer;
begin
  if v_me is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  -- A refusal is an answer, so the count stays: nothing is saved or queued.
  if not internal.rate_limit('calibration:p:' || v_me, 10, interval '1 hour') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.user_titles as ut (profile_id, title_id, source, seen, reaction)
  select v_me, (a->>'title_id')::bigint, 'calibration', a->>'answer' <> 'not_seen',
         case when a->>'answer' in ('love', 'fine', 'nope') then (a->>'answer')::public.reaction end
  from jsonb_array_elements(p_answers) a
  where (a->>'title_id')::bigint in (select ct.title_id from public.calibration_titles ct where ct.is_active)
    and a->>'answer' in ('love', 'fine', 'nope', 'not_seen')
  on conflict (profile_id, title_id, source) do update
    set seen = excluded.seen, reaction = excluded.reaction, updated_at = now();
  get diagnostics v_saved = row_count;

  if p_room_id is not null then
    update public.room_members set calibrated_at = now(), last_active_at = now()
    where room_id = p_room_id and profile_id = v_me
    returning id into v_seat;
    if v_seat is not null then
      perform internal.broadcast_room(p_room_id, 'seat_updated', jsonb_build_object('member_id', v_seat));
    end if;
  end if;

  perform internal.enqueue('taste_refresh', jsonb_build_object('profile_id', v_me, 'reason', 'calibration'));
  return jsonb_build_object('status', 'ok', 'saved', v_saved);
end
$$;
-- GDPR export, 1 per profile per hour. Volatile: it counts, and PostgREST runs
-- stable functions read-only. The data comes with status ok (a compatible addition).
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
                 'reaction', ut.reaction, 'last_watched_on', ut.last_watched_on)), '[]')
        from public.user_titles ut join public.titles t on t.id = ut.title_id, me
        where ut.profile_id = me.id),
      'taste', (select tp.affinities from public.taste_profiles tp, me where tp.profile_id = me.id),
      'games', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'room_id', m.room_id, 'joined_at', m.joined_at,
                 'votes', (select coalesce(jsonb_agg(jsonb_build_object('tmdb_id', t.tmdb_id, 'answer', v.answer,
                                                                        'at', v.created_at)), '[]')
                           from public.votes v join public.titles t on t.id = v.title_id
                           where v.room_member_id = m.id))), '[]')
        from public.room_members m, me where m.profile_id = me.id)
    )
  );
end
$$;

-- M1.11: Clamp dwell and client times, cap array sizes, draw room codes from pgcrypto
-- (security.md#the-database-gaps-found, gaps 8 to 10).
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Six uniform digits from pgcrypto. Rejection sampling: a 32-bit draw is kept only
-- below the largest multiple of a million, so no code is likelier than another.
-- Called only by api.create_room (security definer), so no grant at all.
create function internal.new_room_code() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_bytes bytea;
  v_n bigint;
begin
  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_n := (get_byte(v_bytes, 0)::bigint << 24) + (get_byte(v_bytes, 1)::bigint << 16)
         + (get_byte(v_bytes, 2)::bigint << 8) + get_byte(v_bytes, 3)::bigint;
    exit when v_n < 4294000000;
  end loop;
  return lpad((v_n % 1000000)::text, 6, '0');
end
$$;
revoke execute on function internal.new_room_code() from public, anon, authenticated;

create or replace function api.set_my_providers(p_provider_ids integer[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
  v_country char(2);
  v_provider_ids integer[];
begin
  if v_me is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if cardinality(p_provider_ids) > 50 then
    return jsonb_build_object('status', 'too_many', 'max', 50);
  end if;

  -- Services not listed in the profile's country are dropped (any listed
  -- service if the country is not set), so an unknown id is no longer an error.
  select country into v_country from public.profiles where id = v_me;
  select coalesce(array_agg(t.p), '{}') into v_provider_ids
  from unnest(p_provider_ids) as t(p)
  where exists (select 1 from public.provider_regions pr
                where pr.provider_id = t.p and (v_country is null or pr.country = v_country));

  delete from public.profile_providers where profile_id = v_me and provider_id <> all (v_provider_ids);
  insert into public.profile_providers (profile_id, provider_id)
  select v_me, p from unnest(v_provider_ids) p
  on conflict do nothing;
  return jsonb_build_object('status', 'ok');
end
$$;

create or replace function api.create_room(p_mode text default 'quick_match', p_country char(2) default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_mode public.game_modes;
  v_room public.rooms;
  v_country char(2);
  i integer;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required');
  end if;

  select * into v_mode from public.game_modes where slug = p_mode and is_active;
  if not found then
    return jsonb_build_object('status', 'unknown_mode');
  end if;

  v_country := coalesce(p_country, v_profile.country);
  if v_country is null then
    return jsonb_build_object('status', 'country_required');
  end if;

  -- Later: the monthly hosting cap and the room's tier are decided here.

  for i in 1..10 loop
    begin
      insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, quality)
      values (
        internal.new_room_code(),
        v_profile.id, v_mode.slug, v_country, v_mode.max_players,
        coalesce((v_mode.defaults->>'seen_rule')::public.seen_rule, 'hide_seen'),
        coalesce((v_mode.defaults->>'quality')::public.quality_preset, 'standard')
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if i = 10 then raise; end if;
    end;
  end loop;

  insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key, provider_ids)
  values (
    v_room.id, v_profile.id, v_profile.id, 'host', v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}')
  );
  insert into public.room_models (room_id) values (v_room.id);
  perform internal.refresh_room_providers(v_room.id);

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'code', v_room.code);
end
$$;

create or replace function api.set_seat_prefs(
  p_room_id uuid,
  p_provider_ids integer[] default null,
  p_mood_slugs text[] default null,
  p_genre_ids integer[] default null,
  p_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_seat uuid;
  v_country char(2);
  v_provider_ids integer[];
begin
  -- Over a cap is refused whole, nothing saved: a correct app never sends more.
  if cardinality(p_provider_ids) > 50 then
    return jsonb_build_object('status', 'too_many', 'field', 'provider_ids', 'max', 50);
  end if;
  if cardinality(p_mood_slugs) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'mood_slugs', 'max', 3);
  end if;
  if cardinality(p_genre_ids) > 20 then
    return jsonb_build_object('status', 'too_many', 'field', 'genre_ids', 'max', 20);
  end if;

  select r.country into v_country from public.rooms r
  where r.id = p_room_id and r.state in ('lobby', 'swiping') for no key update;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;

  -- Services not listed in the room's country are dropped silently (null stays null).
  if p_provider_ids is not null then
    select coalesce(array_agg(t.p order by t.o), '{}') into v_provider_ids
    from unnest(p_provider_ids) with ordinality as t(p, o)
    where exists (select 1 from public.provider_regions pr where pr.provider_id = t.p and pr.country = v_country);
  end if;
  update public.room_members m
  set provider_ids = coalesce(v_provider_ids, m.provider_ids),
      mood_slugs = coalesce(p_mood_slugs, m.mood_slugs),
      genre_ids = coalesce(p_genre_ids, m.genre_ids),
      last_active_at = now()
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
  returning m.id into v_seat;
  if v_seat is null then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'seat_updated', jsonb_build_object('member_id', v_seat));
  return jsonb_build_object('status', 'ok');
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
  v_dwell_ms := least(greatest(p_dwell_ms, 0), 120000);
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

  -- Ask the server for more cards when this seat is down to 15. A request
  -- older than 30 seconds is assumed lost and sent again.
  if v_round is null and (v_check is null or (v_check->>'decided') is distinct from 'true') then
    select count(*) into v_remaining
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where d.room_member_id = v_member.id
      and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id);
    if v_remaining <= 15
       and (v_member.refill_requested_at is null or v_member.refill_requested_at < now() - interval '30 seconds') then
      update public.room_members set refill_requested_at = now() where id = v_member.id;
      perform internal.enqueue('deck_requests', jsonb_build_object(
        'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
    end if;
  end if;

  return jsonb_build_object('status', 'ok')
    || jsonb_build_object('match', coalesce(v_check->'match', 'false'::jsonb))
    || case when v_check->>'match' = 'true' then jsonb_build_object('kind', v_check->'kind', 'decided', v_check->'decided')
            else '{}'::jsonb end
    || case when v_round is not null then jsonb_build_object('finale_round_id', v_round) else '{}'::jsonb end;
end
$$;

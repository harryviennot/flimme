-- squawk-ignore-file prefer-bigint-over-int
-- M6.68: Not tonight on the server (game-modes.md#not-tonight, #apiset_seat_skipsroom-genre_ids-person_ids;
-- Harry's answers of 11 Nov 2026).
--
-- * Each seat skips up to 3 genres and 3 people in the lobby (api.set_seat_skips). A room has at most
--   4 genres out tonight (room_limit). A skip takes the genre off every seat's picks; a genre out
--   tonight can't be picked (out_tonight).
-- * At Start the skips of every seat still in the room (present or not) replace
--   room_models.dropped_genre_ids and the new dropped_person_ids, so the offer, the 20-film check and
--   every deal count films after the skips. A start sent back to the lobby clears both.
-- * api.room_genres lists the genres out tonight (never who) and the caller's own skips.
--
-- Replaced whole from their latest versions: internal.eligible_titles, api.set_seat_prefs, api.room_genres,
-- api.start_game (all 20261106121755_seat_genres), internal.deal_cards (20261105171500_solo_daily_cap).

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.room_members
  add column if not exists skip_genre_ids integer[] not null default '{}',
  add column if not exists skip_person_ids integer[] not null default '{}';
alter table public.room_models
  add column if not exists dropped_person_ids integer[] not null default '{}';

-- ---------------------------------------------------------------------------------------
-- The genres out tonight, sorted. In the lobby: the genres skipped by the seats still in the room
-- (not left, not removed), except seat p_except. After Start: the room's dropped genres.
-- ---------------------------------------------------------------------------------------
create function internal.out_genre_ids(p_room_id uuid, p_except uuid default null) returns integer[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case when r.state = 'lobby' then
      (select array_agg(distinct g order by g)
       from public.room_members m cross join lateral unnest(m.skip_genre_ids) as g
       where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
         and (p_except is null or m.id <> p_except))
    else
      (select rm.dropped_genre_ids from public.room_models rm where rm.room_id = p_room_id)
    end
    from public.rooms r where r.id = p_room_id), '{}')
$$;

revoke execute on function internal.out_genre_ids(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- internal.eligible_titles: the 20261106121755 version, plus the dropped people. A film is left out
-- when a dropped person has a director or cast row for it (writers don't count). The stored cast is
-- already the top 8 billed.
-- ---------------------------------------------------------------------------------------
create or replace function internal.eligible_titles(p_room_id uuid, p_include_dealt boolean default false)
returns table (id bigint, popularity real, quality_score real, collection_id integer, genre_ids integer[])
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
  dropped_people as (
    select coalesce((select rm.dropped_person_ids from public.room_models rm where rm.room_id = p_room_id), '{}') as ids
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
  )
  select t.id, t.popularity, t.quality_score, t.collection_id, t.genre_ids
  from room r
  cross join services sv
  cross join dropped d
  cross join dropped_people dp
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
    and (cardinality(dp.ids) = 0 or not exists (
          select 1 from public.title_credits tc
          where tc.title_id = t.id and tc.person_id = any (dp.ids) and tc.role in ('director', 'cast')))
    and (p_include_dealt or not exists (
          select 1 from public.room_cards rc where rc.room_id = p_room_id and rc.title_id = t.id))
    -- A solo room leaves out every film the player answered, with any answer, in another solo room
    -- (an undone vote is gone, so that film may come back). Group rooms are not filtered.
    and (r.mode <> 'solo' or not exists (
          select 1 from public.votes v
          join public.room_members vm on vm.id = v.room_member_id
          join public.rooms vr on vr.id = vm.room_id
          where v.title_id = t.id and vr.mode = 'solo' and vr.id <> p_room_id
            and vm.profile_id in (select mm.profile_id from members mm)))
    -- ... and every film already in the player's My films: liked, super liked, picked (M6.41) or
    -- saved for Later (M6.50). Group rooms never read saved_at.
    and (r.mode <> 'solo' or not exists (
          select 1 from public.user_titles lu
          where lu.title_id = t.id and (lu.liked_at is not null or lu.picked_at is not null or lu.saved_at is not null)
            and lu.profile_id in (select mm.profile_id from members mm)))
$$;

-- ---------------------------------------------------------------------------------------
-- api.set_seat_skips: one seat's Not tonight, in the lobby only. The room row is locked, so a skip
-- and a pick can't race. Each newly skipped genre leaves every seat's picks in the room.
-- ---------------------------------------------------------------------------------------
create function api.set_seat_skips(
  p_room_id uuid,
  p_genre_ids integer[] default null,
  p_person_ids integer[] default null,
  p_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_max_out constant integer := 4;   -- game-modes.md#starting-values: the room's out genres
  v_state public.room_state;
  v_mode text;
  v_seat uuid;
  v_old_genres integer[];
  v_old_people integer[];
  v_genres integer[];
  v_people integer[];
  v_others integer[];
  v_out_before integer[];
  v_out_after integer[];
  v_picks_changed boolean := false;
begin
  -- Over a cap is refused whole, nothing saved.
  if cardinality(p_genre_ids) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'genre_ids', 'max', 3);
  end if;
  if cardinality(p_person_ids) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'person_ids', 'max', 3);
  end if;

  select r.state, r.mode into v_state, v_mode from public.rooms r
  where r.id = p_room_id for no key update;
  if not found or v_state in ('done', 'abandoned') then
    return jsonb_build_object('status', 'closed');
  end if;

  select m.id, m.skip_genre_ids, m.skip_person_ids into v_seat, v_old_genres, v_old_people
  from public.room_members m
  where m.room_id = p_room_id
    and m.left_at is null and m.removed_at is null   -- this call writes to other seats: a seat out of the room can't
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()));
  if v_seat is null then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  -- Lobby only: from Start a change is refused. A solo room has no lobby.
  if v_state <> 'lobby' or v_mode = 'solo' then
    return jsonb_build_object('status', 'locked');
  end if;

  if p_genre_ids is not null then
    if exists (select 1 from unnest(p_genre_ids) g
               where g is null or not exists (select 1 from public.genres x
                                              where x.id = g and 'movie' = any (x.media_types))) then
      return jsonb_build_object('status', 'unknown_genre');
    end if;
    -- A repeated genre is kept once, in the order sent.
    select coalesce(array_agg(x.g order by x.o), '{}') into v_genres
    from (select g, min(o) as o from unnest(p_genre_ids) with ordinality as t(g, o) group by g) x;
  end if;

  if p_person_ids is not null then
    -- A director or cast credit on an active film that isn't adult (the floor of eligible_titles).
    if exists (select 1 from unnest(p_person_ids) p
               where p is null or not exists (
                 select 1 from public.title_credits c
                 join public.titles t on t.id = c.title_id and t.media_type = 'movie' and t.is_active and not t.is_adult
                 where c.person_id = p and c.role in ('director', 'cast'))) then
      return jsonb_build_object('status', 'unknown_person');
    end if;
    select coalesce(array_agg(x.p order by x.o), '{}') into v_people
    from (select p, min(o) as o from unnest(p_person_ids) with ordinality as t(p, o) group by p) x;
  end if;

  -- The room's limit: the genres the other seats still in the room skipped, with this seat's new list
  -- in place of its old one. A genre already out (an old skip of this seat, or another seat's) is never new.
  if v_genres is not null then
    v_others := internal.out_genre_ids(p_room_id, v_seat);
    if exists (select 1 from unnest(v_genres) g where g <> all (v_others) and g <> all (v_old_genres))
       and cardinality(array(select distinct g from unnest(v_others || v_genres) g)) > c_max_out then
      return jsonb_build_object('status', 'room_limit', 'max', c_max_out);
    end if;
  end if;

  v_out_before := internal.out_genre_ids(p_room_id);

  update public.room_members m
  set skip_genre_ids = coalesce(v_genres, m.skip_genre_ids),
      skip_person_ids = coalesce(v_people, m.skip_person_ids)
  where m.id = v_seat;

  -- A skipped genre leaves every seat's picks, the skipper's own included. Lifting brings nothing back.
  if v_genres is not null and cardinality(v_genres) > 0 then
    with cut as (
      update public.room_members m
      set genre_ids = array(select g from unnest(m.genre_ids) with ordinality as u(g, o)
                            where g <> all (v_genres) order by o)
      where m.room_id = p_room_id and m.genre_ids && v_genres
      returning 1)
    select exists (select 1 from cut) into v_picks_changed;
  end if;

  v_out_after := internal.out_genre_ids(p_room_id);
  if v_picks_changed or v_out_after is distinct from v_out_before then
    perform internal.broadcast_room(p_room_id, 'genres_changed', '{}'::jsonb);
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;

revoke execute on function api.set_seat_skips(uuid, integer[], integer[], uuid) from public, anon;
grant execute on function api.set_seat_skips(uuid, integer[], integer[], uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- api.set_seat_prefs: the 20261106121755 version, plus out_tonight: a genre out tonight can't be
-- picked, the caller's own skip included.
-- ---------------------------------------------------------------------------------------
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
  v_state public.room_state;
  v_country char(2);
  v_provider_ids integer[];
  v_genre_ids integer[];
  v_before integer[];
begin
  -- Over a cap is refused whole, nothing saved: a correct app never sends more.
  if cardinality(p_provider_ids) > 50 then
    return jsonb_build_object('status', 'too_many', 'field', 'provider_ids', 'max', 50);
  end if;
  if cardinality(p_mood_slugs) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'mood_slugs', 'max', 3);
  end if;
  if cardinality(p_genre_ids) > 3 then
    return jsonb_build_object('status', 'too_many', 'field', 'genre_ids', 'max', 3);
  end if;

  select r.state, r.country into v_state, v_country from public.rooms r
  where r.id = p_room_id for no key update;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;
  if v_state not in ('lobby', 'swiping') and not (p_genre_ids is not null and v_state in ('dealing', 'finale')) then
    return jsonb_build_object('status', 'closed');
  end if;

  select m.id, m.genre_ids into v_seat, v_before from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()));
  if v_seat is null then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if p_genre_ids is not null then
    -- Picks lock at Start; late joiners play the deck as it is.
    if v_state <> 'lobby' then
      return jsonb_build_object('status', 'locked');
    end if;
    if exists (select 1 from unnest(p_genre_ids) g
               where g is null or g not in (select o.genre_id from internal.offered_genres(p_room_id) o)) then
      return jsonb_build_object('status', 'unknown_genre');
    end if;
    -- Not tonight: every seat's skips count, the caller's own included.
    if p_genre_ids && internal.out_genre_ids(p_room_id) then
      return jsonb_build_object('status', 'out_tonight');
    end if;
    -- A repeated genre is kept once, in the order sent.
    select coalesce(array_agg(x.g order by x.o), '{}') into v_genre_ids
    from (select g, min(o) as o from unnest(p_genre_ids) with ordinality as t(g, o) group by g) x;
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
      genre_ids = coalesce(v_genre_ids, m.genre_ids),
      last_active_at = now()
  where m.id = v_seat;

  perform internal.refresh_room_providers(p_room_id);
  if p_provider_ids is not null or p_mood_slugs is not null or p_genre_ids is null then
    perform internal.broadcast_room(p_room_id, 'seat_updated', jsonb_build_object('member_id', v_seat));
  end if;
  if v_genre_ids is not null and v_genre_ids is distinct from v_before then
    perform internal.broadcast_room(p_room_id, 'genres_changed', '{}'::jsonb);
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;

-- ---------------------------------------------------------------------------------------
-- api.room_genres: the 20261106121755 version, plus out and skips. out: in the lobby, the genres
-- skipped by the other seats still in the room (never the caller's own); after Start, every dropped
-- genre. An option is out when it is in out or in the caller's own skips: count 0 and out true, so
-- builds that read count keep working. skips: the caller's own genres, and its people with id and
-- name only. Never another seat's people, never a seat id or a name.
-- ---------------------------------------------------------------------------------------
create or replace function api.room_genres(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_started boolean;
  v_seat uuid;
  v_skips integer[];
  v_skip_people integer[];
  v_out integer[];
  v_answer jsonb;
begin
  if not internal.is_room_member(p_room_id) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  select r.state <> 'lobby' into v_started from public.rooms r where r.id = p_room_id;

  select m.id, m.skip_genre_ids, m.skip_person_ids into v_seat, v_skips, v_skip_people
  from public.room_members m
  where m.room_id = p_room_id and m.profile_id = internal.my_profile_id() and m.removed_at is null
  limit 1;
  v_skips := coalesce(v_skips, '{}');
  v_skip_people := coalesce(v_skip_people, '{}');
  v_out := internal.out_genre_ids(p_room_id, v_seat);

  with offered as (
    select o.genre_id from internal.offered_genres(p_room_id, coalesce(v_started, false)) o
  ),
  present as (
    select m.genre_ids from public.room_members m
    where m.id = any (internal.present_member_ids(p_room_id)) and m.removed_at is null
  ),
  me as (
    select m.genre_ids from public.room_members m
    where m.room_id = p_room_id and m.profile_id = internal.my_profile_id() and m.removed_at is null
    limit 1
  )
  select jsonb_build_object(
    'status', 'ok',
    'options', coalesce((
      select jsonb_agg(
               case when o.genre_id = any (v_out) or o.genre_id = any (v_skips)
                 then jsonb_build_object('genre_id', o.genre_id, 'count', 0, 'out', true)
                 else jsonb_build_object('genre_id', o.genre_id,
                        'count', (select count(*) from present p where o.genre_id = any (p.genre_ids)))
               end
             order by o.genre_id)
      from offered o), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(u.g order by u.ord)
      from me cross join lateral unnest(me.genre_ids) with ordinality as u(g, ord)
      where u.g in (select genre_id from offered)), '[]'::jsonb),
    'out', to_jsonb(v_out),
    'skips', jsonb_build_object(
      'genre_ids', to_jsonb(v_skips),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by u.ord)
        from unnest(v_skip_people) with ordinality as u(pid, ord)
        join public.people p on p.id = u.pid), '[]'::jsonb)))
  into v_answer;
  return v_answer;
end
$$;

-- ---------------------------------------------------------------------------------------
-- api.start_game: the 20261106121755 version, plus the skips of every seat still in the room (present
-- or not) copied into the room before the picks lock, replacing what was there. So the 30-film offer,
-- the starvation guard and the deal all count films after the skips.
-- ---------------------------------------------------------------------------------------
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
  -- Not tonight (M6.68): every seat still in the room, present or not, counts. Sorted, no repeats.
  update public.room_models rm
  set dropped_genre_ids = coalesce((
        select array_agg(distinct g order by g)
        from public.room_members m cross join lateral unnest(m.skip_genre_ids) as g
        where m.room_id = p_room_id and m.left_at is null and m.removed_at is null), '{}'),
      dropped_person_ids = coalesce((
        select array_agg(distinct p order by p)
        from public.room_members m cross join lateral unnest(m.skip_person_ids) as p
        where m.room_id = p_room_id and m.left_at is null and m.removed_at is null), '{}')
  where rm.room_id = p_room_id;
  -- Picks lock at Start (M6.53): the present seats' offered picks drive every deal from here.
  perform internal.lock_genre_picks(p_room_id);
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

-- ---------------------------------------------------------------------------------------
-- internal.deal_cards: the 20261105171500 version. A group start sent back to the lobby for too few
-- films also clears the room's copy of the skips; the seats keep theirs.
-- ---------------------------------------------------------------------------------------
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
  -- M6.68: the room's copy of the Not tonight skips is cleared, so the lobby's offer is what it was.
  if v_state = 'dealing' then
    v_eligible := coalesce((p_payload->'request'->>'candidates')::int,
                           jsonb_array_length(coalesce(p_payload->'pool', '[]')));
    if v_eligible < c_min_films then
      if v_mode = 'solo' then
        perform internal.abandon_room(p_room_id);
      else
        update public.rooms set state = 'lobby', dealing_at = null where id = p_room_id;
        update public.room_models set dropped_genre_ids = '{}', dropped_person_ids = '{}' where room_id = p_room_id;
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

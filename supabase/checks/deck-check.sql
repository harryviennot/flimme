-- M5.8: check decks on the real catalog.
--
-- Paste this whole file into the Supabase SQL editor of STAGING and run it. Never
-- run it on production. Nothing is left behind: every write happens inside one
-- sub-block that ends by raising an exception, which undoes the writes. The
-- report is the single result grid; copy it back to the session.
--
-- Step 1 reads the catalog's counts and stops with a STOP row if they are too low
-- (under 40,000 active films, or a listed French service with no availability).
-- Step 2 builds five rooms of seats with no profile, deals each with
-- internal.deal_baseline (the room 'dealing', as a start does) and checks the
-- cards. Room 2 is also timed. The last rows show that the tables are unchanged.
--
-- Titles appear in the report for Harry to read. They must not be copied into
-- git (CLAUDE.md rule 7): the findings hold ids, counts, years and timings only.
--
-- Local runs only (supabase db reset, which loads the 500-film seed): run
--   set deckcheck.min_films = 100;
-- in the same session before this file, because the seed is far under the 40,000
-- films gate. The setting is read with a default of 40000, so a plain paste
-- checks the real gate.

create or replace function pg_temp.dc_row(p_section text, p_room text, p_pos integer, p_item text, p_details text)
returns jsonb language sql immutable
as $$ select jsonb_build_array(p_section, p_room, p_pos, p_item, p_details) $$;

-- Makes one room in the state 'dealing'. Seats have no profile. The services are
-- the first n listed French ones by display priority (n = 0: none picked), and
-- internal.refresh_room_providers adds the free services, as it does for a real room.
create or replace function pg_temp.dc_room(
  p_players integer, p_services integer, p_runtime integer, p_max_age integer, p_seed integer
) returns uuid
language plpgsql
as $$
declare
  v_room uuid;
  v_ids integer[];
  i integer;
begin
  select coalesce(array_agg(x.provider_id), '{}') into v_ids
  from (
    select pr.provider_id from public.provider_regions pr
    where pr.country = 'FR' and pr.is_listed
    order by pr.display_priority, pr.provider_id
    limit p_services
  ) x;

  insert into public.rooms (code, mode, state, country, runtime_max, max_age, seed, dealing_at)
  values ('9990' || lpad((p_seed % 100)::text, 2, '0'), 'quick_match', 'dealing', 'FR', p_runtime, p_max_age, p_seed, now())
  returning id into v_room;

  for i in 1..p_players loop
    insert into public.room_members (room_id, display_name, avatar_key, provider_ids, joined_at)
    values (v_room, 'Check ' || i, 'default', v_ids, now() + i * interval '1 second');
  end loop;

  perform internal.refresh_room_providers(v_room);
  return v_room;
end
$$;

-- Deals a room and returns its report rows, seat 1's openings and the deal's time.
create or replace function pg_temp.dc_deal(
  p_label text, p_room uuid,
  out p_rows jsonb, out p_open10 bigint[], out p_open25 bigint[], out p_ms numeric
)
language plpgsql
as $$
declare
  v_room public.rooms;
  v_svc integer[];
  v_seat1 uuid;
  v_ans jsonb;
  v_t timestamptz;
  v_eligible integer;
  v_seats integer;
  v_ok boolean;
  v_rows jsonb := '[]';
  v_tmp jsonb;
begin
  select * into v_room from public.rooms where id = p_room;
  select coalesce(array_agg(p.id), '{}') into v_svc
  from public.providers p where p.id = any (v_room.provider_ids) or p.parent_id = any (v_room.provider_ids);
  select m.id into v_seat1 from public.room_members m where m.room_id = p_room order by m.joined_at, m.id limit 1;
  select count(*) into v_seats from public.room_members where room_id = p_room;

  select count(*) into v_eligible from internal.deck_candidates(p_room, 100000, 0);

  v_t := clock_timestamp();
  v_ans := internal.deal_baseline(p_room);
  p_ms := round((extract(epoch from clock_timestamp() - v_t) * 1000)::numeric, 1);

  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('room', p_label, 0, 'settings',
    format('players=%s services=%s (with free ones) offers=%s runtime_max=%s max_age=%s quality=%s seed=%s',
      v_seats, coalesce(array_length(v_room.provider_ids, 1), 0), v_room.offer_kinds, v_room.runtime_max,
      v_room.max_age, v_room.quality, v_room.seed)));
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('room', p_label, 0, 'eligible films', v_eligible::text));
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('room', p_label, 0, 'deal answer', v_ans::text));

  -- Seat 1's 25 cards, in order.
  select coalesce(jsonb_agg(pg_temp.dc_row('card', p_label, c.pos::integer, c.title, c.details) order by c.pos), '[]')
  into v_tmp
  from (
    select row_number() over (order by e.sort_key) as pos,
      coalesce((select tr.title from public.title_translations tr where tr.title_id = t.id and tr.language = 'fr'),
               (select tr.title from public.title_translations tr where tr.title_id = t.id and tr.language = 'en'),
               t.original_title, '?') as title,
      format('id=%s year=%s runtime=%s votes=%s quality=%s popularity=%s collection=%s cert=%s on=%s',
        t.id, t.release_year, t.runtime_min, t.vote_count, round(t.quality_score::numeric, 2),
        round(t.popularity::numeric, 1), coalesce(t.collection_id::text, '-'),
        coalesce((select c.certification from public.title_certifications c where c.title_id = t.id and c.country = 'FR'), '?'),
        coalesce((select string_agg(distinct p.name, ', ' order by p.name)
                  from public.title_availability a join public.providers p on p.id = a.provider_id
                  where a.title_id = t.id and a.country = 'FR' and a.provider_id = any (v_svc)
                    and a.kind = any (v_room.offer_kinds)), 'NONE')) as details
    from public.deck_entries e join public.titles t on t.id = e.title_id
    where e.room_member_id = v_seat1
  ) c;
  v_rows := v_rows || v_tmp;

  select coalesce(array_agg(e.title_id order by e.sort_key), '{}') into p_open25
  from public.deck_entries e where e.room_member_id = v_seat1;
  p_open10 := p_open25[1:10];

  -- The checks, over every seat's cards.
  v_ok := (select r.state = 'swiping' from public.rooms r where r.id = p_room) and v_ans->>'status' = 'ok';
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'deal ok, room swiping', coalesce(v_ok, false)::text));

  v_ok := (select count(*) = 25 from public.deck_entries e where e.room_member_id = v_seat1);
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'seat 1 has 25 cards', v_ok::text));

  v_ok := not exists (
    select 1 from public.deck_entries d where d.room_id = p_room and not exists (
      select 1 from public.title_availability a
      where a.title_id = d.title_id and a.country = 'FR' and a.provider_id = any (v_svc) and a.kind = any (v_room.offer_kinds)));
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'every card on a room service in France', v_ok::text));

  v_ok := v_room.max_age is null or not exists (
    select 1 from public.deck_entries d where d.room_id = p_room and not exists (
      select 1 from public.title_certifications c
      where c.title_id = d.title_id and c.country = 'FR' and c.min_age <= v_room.max_age));
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'every card within the age cap', v_ok::text));

  v_ok := v_room.runtime_max is null or not exists (
    select 1 from public.deck_entries d join public.titles t on t.id = d.title_id
    where d.room_id = p_room and t.runtime_min > v_room.runtime_max);
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'every card within the time budget', v_ok::text));

  v_ok := not exists (
    select 1
    from (select d.room_member_id, t.collection_id,
            row_number() over (partition by d.room_member_id order by d.sort_key) as rn
          from public.deck_entries d join public.titles t on t.id = d.title_id
          where d.room_id = p_room) a
    join (select d.room_member_id, t.collection_id,
            row_number() over (partition by d.room_member_id order by d.sort_key) as rn
          from public.deck_entries d join public.titles t on t.id = d.title_id
          where d.room_id = p_room) b
      on b.room_member_id = a.room_member_id and b.collection_id = a.collection_id and b.rn > a.rn and b.rn - a.rn < 10
    where a.collection_id is not null);
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'no collection twice in any 10 cards', v_ok::text));

  v_ok := (select count(distinct o.opening) = 1 and min(cardinality(o.opening)) = 10
           from (select d.room_member_id, array_agg(d.title_id order by d.sort_key) filter (where d.rn <= 10) as opening
                 from (select e.*, row_number() over (partition by e.room_member_id order by e.sort_key) as rn
                       from public.deck_entries e where e.room_id = p_room) d
                 group by d.room_member_id) o);
  v_rows := v_rows || jsonb_build_array(pg_temp.dc_row('check', p_label, 0, 'every seat has the same opening', coalesce(v_ok, false)::text));

  p_rows := v_rows;
end
$$;

create or replace function pg_temp.deck_check()
returns table (section text, room text, pos integer, item text, details text)
language plpgsql
as $$
declare
  c_min_films constant integer := coalesce(nullif(current_setting('deckcheck.min_films', true), '')::integer, 40000);
  v_out jsonb := '[]';
  v_tmp jsonb;
  v_films integer;
  v_unserved integer;
  v_before jsonb;
  v_after jsonb;
  v_room uuid;
  v_d record;
  v_d2 record;
  v_times numeric[] := '{}';
  v_median numeric;
  v_t timestamptz;
  i integer;
  v_shared10 integer;
  v_shared25 integer;
begin
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('run', '-', 0, 'database', current_database() || ' at ' || now()::text));

  -- ===== Step 1: the catalog (read only) =====
  select count(*) into v_films from public.titles t where t.is_active;
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'active films', v_films::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'with quality_score',
    (select count(*) from public.titles t where t.is_active and t.quality_score is not null)::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'with poster_placeholder',
    (select count(*) from public.titles t where t.is_active and t.poster_placeholder is not null)::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'with collection_id',
    (select count(*) from public.titles t where t.is_active and t.collection_id is not null)::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'with a French certification age',
    (select count(*) from public.titles t where t.is_active and exists (
       select 1 from public.title_certifications c where c.title_id = t.id and c.country = 'FR' and c.min_age is not null))::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'passing the standard floor with a poster',
    (select count(*) from public.titles t where t.is_active and not t.is_adult and t.poster_path is not null
       and t.vote_count >= 150 and t.quality_score >= 6.2::real)::text));

  select coalesce(jsonb_agg(pg_temp.dc_row('catalog', case when s.is_listed then 'listed' else 'free' end, s.display_priority::integer,
           s.name || ' (' || s.provider_id || ')', format('availability rows=%s films=%s', s.n, s.films))
           order by s.is_listed desc, s.display_priority, s.provider_id), '[]'),
         count(*) filter (where s.is_listed and s.n = 0)
  into v_tmp, v_unserved
  from (
    select pr.provider_id, p.name, pr.is_listed, pr.display_priority, a.n, a.films
    from public.provider_regions pr
    join public.providers p on p.id = pr.provider_id
    cross join lateral (
      select count(*) as n, count(distinct x.title_id) as films
      from public.title_availability x
      where x.country = 'FR' and (x.provider_id = pr.provider_id
        or x.provider_id in (select v.id from public.providers v where v.parent_id = pr.provider_id))
    ) a
    where pr.country = 'FR' and (pr.is_listed or pr.free_for_all)
  ) s;
  v_out := v_out || v_tmp;

  select coalesce(jsonb_agg(pg_temp.dc_row('catalog', '-', 0, 'ingest_runs ' || k.kind,
           format('runs=%s, last started=%s finished=%s touched=%s errors=%s', k.n, k.started_at, k.finished_at, k.touched, k.errors))), '[]')
  into v_tmp
  from (
    select kinds.kind, (select count(*) from public.ingest_runs r where r.kind = kinds.kind) as n,
           l.started_at, l.finished_at, l.titles_touched as touched, l.errors
    from (values ('backfill'), ('availability_sweep')) as kinds(kind)
    left join lateral (select * from public.ingest_runs r where r.kind = kinds.kind order by r.started_at desc limit 1) l on true
  ) k;
  v_out := v_out || v_tmp;

  if v_films < c_min_films or v_unserved > 0
     or not exists (select 1 from public.provider_regions pr where pr.country = 'FR' and pr.is_listed) then
    v_out := v_out || jsonb_build_array(pg_temp.dc_row('STOP', '-', 0, 'the catalog is too low, no decks checked',
      format('active films=%s (needs %s), listed French services with no availability rows=%s. Report these counts; M2.13 still needs the load to finish.',
             v_films, c_min_films, v_unserved)));
    return query select (r.e->>0), (r.e->>1), (r.e->>2)::integer, (r.e->>3), (r.e->>4)
                 from jsonb_array_elements(v_out) with ordinality r(e, o) order by r.o;
    return;
  end if;
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('catalog', '-', 0, 'gate', 'passed (step 2 follows)'));

  -- ===== Step 2: the decks. Everything in this block is undone at its end. =====
  select jsonb_build_object('rooms', (select count(*) from public.rooms), 'members', (select count(*) from public.room_members),
    'room_cards', (select count(*) from public.room_cards), 'deck_entries', (select count(*) from public.deck_entries),
    'rec.requests', (select count(*) from rec.requests), 'rec.request_items', (select count(*) from rec.request_items))
  into v_before;

  begin
    -- Room 1: 2 players, the first listed service, no cap, any length.
    v_room := pg_temp.dc_room(2, 1, null, null, 1001);
    select * into v_d from pg_temp.dc_deal('1', v_room);
    v_out := v_out || v_d.p_rows;

    -- Room 2, the timing room: 4 players, the first three services, under 2 h, Adults (no cap).
    v_room := pg_temp.dc_room(4, 3, 120, null, 1002);
    for i in 1..3 loop
      v_t := clock_timestamp();
      perform count(*) from internal.deck_candidates(v_room, 300, 1.0);
      v_times := v_times || round((extract(epoch from clock_timestamp() - v_t) * 1000)::numeric, 1);
    end loop;
    select percentile_disc(0.5) within group (order by x) into v_median from unnest(v_times) x;
    select * into v_d from pg_temp.dc_deal('2', v_room);
    v_out := v_out || v_d.p_rows;
    v_out := v_out || jsonb_build_array(pg_temp.dc_row('timing', '2', 0, 'deck_candidates(room, 300), three runs in ms', v_times::text));
    v_out := v_out || jsonb_build_array(pg_temp.dc_row('timing', '2', 0, 'deck_candidates median ms',
      v_median || case when v_median < 150 then ' PASS (under 150)' else ' OVER 150 (Free plan, indicative; re-time after Pro)' end));
    v_out := v_out || jsonb_build_array(pg_temp.dc_row('timing', '2', 0, 'deal_baseline ms, call to return',
      v_d.p_ms || case when v_d.p_ms < 1000 then ' PASS (under 1000)' else ' OVER 1000' end));

    -- Room 2's settings again with another seed: how much the openings overlap.
    v_room := pg_temp.dc_room(4, 3, 120, null, 7777);
    select * into v_d2 from pg_temp.dc_deal('2 other seed', v_room);
    v_out := v_out || v_d2.p_rows;
    select count(*) into v_shared10 from unnest(v_d2.p_open10) a where a = any (v_d.p_open10);
    select count(*) into v_shared25 from unnest(v_d2.p_open25) a where a = any (v_d.p_open25);
    v_out := v_out || jsonb_build_array(pg_temp.dc_row('overlap', '2 vs other seed', 0,
      'seat 1 cards in common (first 10, all 25)', v_shared10 || ' of 10, ' || v_shared25 || ' of 25 (expected small)'));

    -- Room 3: 6 players, two services, age cap 12, under 1 h 45.
    v_room := pg_temp.dc_room(6, 2, 105, 12, 1003);
    select * into v_d from pg_temp.dc_deal('3', v_room);
    v_out := v_out || v_d.p_rows;

    -- Room 4: 10 players, every listed service, All ages (cap 0).
    v_room := pg_temp.dc_room(10, 1000, null, 0, 1004);
    select * into v_d from pg_temp.dc_deal('4', v_room);
    v_out := v_out || v_d.p_rows;

    -- Room 5: 3 players, no service picked (free services only), age cap 10.
    v_room := pg_temp.dc_room(3, 0, null, 10, 1005);
    select * into v_d from pg_temp.dc_deal('5', v_room);
    v_out := v_out || v_d.p_rows;

    raise exception 'deck_check done, undoing every write' using errcode = 'DCK01';
  exception when sqlstate 'DCK01' then
    null;   -- v_out keeps what it collected; the database writes are undone
  end;

  select jsonb_build_object('rooms', (select count(*) from public.rooms), 'members', (select count(*) from public.room_members),
    'room_cards', (select count(*) from public.room_cards), 'deck_entries', (select count(*) from public.deck_entries),
    'rec.requests', (select count(*) from rec.requests), 'rec.request_items', (select count(*) from rec.request_items))
  into v_after;
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('rollback', '-', 0, 'row counts before', v_before::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('rollback', '-', 0, 'row counts after', v_after::text));
  v_out := v_out || jsonb_build_array(pg_temp.dc_row('rollback', '-', 0, 'nothing left behind', (v_before = v_after)::text));

  return query select (r.e->>0), (r.e->>1), (r.e->>2)::integer, (r.e->>3), (r.e->>4)
               from jsonb_array_elements(v_out) with ordinality r(e, o) order by r.o;
end
$$;

select * from pg_temp.deck_check();

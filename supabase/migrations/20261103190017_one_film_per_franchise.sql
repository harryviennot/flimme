-- M5.3: one film per franchise in the opening and in any 10 cards
-- (deck-engine.md#variety, #the-sql-fallback). internal.deal_baseline is M5.2's
-- version with one change: each seat's cards are picked position by position,
-- skipping a film whose collection is among the seat's previous 9 cards. A
-- skipped film stays in the list for later positions; when none fits, the seat
-- gets fewer cards and the next refill tries again (Q3.1). A film with no
-- collection never clashes. Same signature, no other change.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function internal.deal_baseline(p_room_id uuid, p_seat uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_temp constant double precision := 0.3;
  c_deal_size constant integer := 25;
  c_opening constant integer := 10;
  c_window constant integer := 10;     -- deck.variety.collection_window
  v_state public.room_state;
  v_seed integer;
  v_raw jsonb;
  v_new jsonb;
  v_decks jsonb;
  v_pool jsonb;
  v_seat uuid;
  v_n integer;
  v_list jsonb;
  v_window integer[];
  v_len integer;
  v_used boolean[];
  v_cards jsonb;
  v_pos integer;
  v_i integer;
  v_pick integer;
  v_coll integer;
begin
  select state, seed into v_state, v_seed from public.rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v_raw from internal.deck_candidates(p_room_id, 300, 1.0) c;
  if jsonb_array_length(v_raw) < 50 then
    select coalesce(jsonb_agg(to_jsonb(c)), '[]') into v_raw from internal.deck_candidates(p_room_id, 300, 0) c;
  end if;

  -- The new films in draw order, each with its odds among the films not yet drawn.
  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', x.title_id, 'group_score', x.gs, 'min_fit', x.min_fit, 'fits', x.fits,
           'score', x.gs, 'propensity', x.share, 'k', x.k, 'collection_id', x.coll) order by x.k desc, x.title_id), '[]')
  into v_new
  from (
    select y.*, y.w / sum(y.w) over (order by y.k desc, y.title_id rows between current row and unbounded following) as share
    from (
      select (e->>'title_id')::bigint as title_id, (e->>'group_score')::real as gs, (e->>'min_fit')::real as min_fit,
             e->'fits' as fits, (e->>'collection_id')::integer as coll,
             internal.shuffle_key(v_seed, (e->>'title_id')::bigint, (e->>'group_score')::real) as k,
             exp(((e->>'group_score')::double precision - max((e->>'group_score')::double precision) over ()) / c_temp) as w
      from jsonb_array_elements(v_raw) e
    ) y
  ) x;

  -- Each seat's cards: its pool films first, then the new ones, up to 25 unvoted,
  -- walked one position at a time. A film takes the position only if its franchise
  -- (titles.collection_id) is not among the seat's previous 9 cards; a film skipped
  -- stays in the list for later positions, and when none fits the seat gets fewer
  -- cards (Q3.1). A start has empty decks, so every seat walks the same list and
  -- the shared opening stays identical. A refill and a late joiner count the seat's
  -- last 9 entries by sort_key, so the rule holds across the join. Cards a like
  -- moved up and restored votes are not checked (Q3.2).
  v_decks := '[]';
  for v_seat, v_n in
    select m.id, q.n
    from public.room_members m
    cross join lateral (
      select greatest(c_deal_size - count(*), 0)::integer as n
      from public.deck_entries d
      join public.room_cards rc on rc.room_id = d.room_id and rc.title_id = d.title_id and rc.state = 'active'
      where d.room_member_id = m.id
        and not exists (select 1 from public.votes v where v.room_member_id = m.id and v.title_id = d.title_id)
    ) q
    where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
      and (p_seat is null or m.id = p_seat)
      and q.n > 0
    order by m.joined_at, m.id
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'title_id', u.title_id, 'score', u.score, 'propensity', u.propensity, 'coll', u.coll)
           order by u.grp, u.k desc, u.title_id), '[]')
    into v_list
    from (
      select 0 as grp, p.title_id, p.gs as score, p.k, p.coll,
             p.w / sum(p.w) over (order by p.k desc, p.title_id rows between current row and unbounded following) as propensity
      from (
        select rc.title_id, rc.group_score as gs, t.collection_id as coll,
               internal.shuffle_key(v_seed, rc.title_id, rc.group_score) as k,
               exp((rc.group_score::double precision - max(rc.group_score::double precision) over ()) / c_temp) as w
        from public.room_cards rc
        join public.titles t on t.id = rc.title_id
        where rc.room_id = p_room_id and rc.state = 'active'
          and not exists (select 1 from public.deck_entries de
                          where de.room_member_id = v_seat and de.title_id = rc.title_id)
      ) p
      union all
      select 1, (e->>'title_id')::bigint, (e->>'score')::real, (e->>'k')::double precision,
             (e->>'collection_id')::integer, (e->>'propensity')::double precision
      from jsonb_array_elements(v_new) e
    ) u;

    -- The previous cards' franchises, oldest first (a null is a film with none).
    select coalesce(array_agg(w.coll order by w.sort_key), '{}') into v_window
    from (
      select t.collection_id as coll, d.sort_key
      from public.deck_entries d
      join public.titles t on t.id = d.title_id
      where d.room_member_id = v_seat
      order by d.sort_key desc
      limit c_window - 1
    ) w;

    v_len := jsonb_array_length(v_list);
    v_used := case when v_len > 0 then array_fill(false, array[v_len]) else '{}' end;
    v_cards := '[]';
    for v_pos in 1..v_n loop
      v_pick := null;
      for v_i in 1..v_len loop
        continue when v_used[v_i];
        v_coll := (v_list->(v_i - 1)->>'coll')::integer;
        if v_coll is null or not coalesce(v_coll = any (v_window), false) then
          v_pick := v_i;
          exit;
        end if;
      end loop;
      exit when v_pick is null;
      v_used[v_pick] := true;
      v_coll := (v_list->(v_pick - 1)->>'coll')::integer;
      v_cards := v_cards || jsonb_build_array(jsonb_build_object(
        'title_id', v_list->(v_pick - 1)->'title_id', 'score', v_list->(v_pick - 1)->'score',
        'propensity', v_list->(v_pick - 1)->'propensity',
        'source', case when v_state = 'dealing' and v_pos <= c_opening then 'opening' else 'ranked' end));
      v_window := array_append(v_window, v_coll);
      if cardinality(v_window) > c_window - 1 then
        v_window := v_window[cardinality(v_window) - c_window + 2 : cardinality(v_window)];
      end if;
    end loop;

    v_decks := v_decks || jsonb_build_array(jsonb_build_object('room_member_id', v_seat, 'cards', v_cards));
  end loop;

  -- M1.13: a refill with nothing to deal changes nothing, so it logs no request
  -- and broadcasts no deck_updated. A start still goes through deal_cards, which
  -- moves the room to swiping (too few films is M5.5's to handle).
  if v_state = 'swiping' then
    select coalesce(jsonb_agg(d), '[]') into v_decks
    from jsonb_array_elements(v_decks) d where jsonb_array_length(d->'cards') > 0;
    if jsonb_array_length(v_decks) = 0 then
      return jsonb_build_object('status', 'ok', 'request_id', null, 'started', false, 'seats', 0);
    end if;
  end if;

  -- Only the new films join the pool; the pool films were dealt before.
  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', x.e->'title_id', 'group_score', x.e->'group_score', 'min_fit', x.e->'min_fit', 'fits', x.e->'fits')
         order by x.ord), '[]')
  into v_pool
  from jsonb_array_elements(v_new) with ordinality as x(e, ord)
  where (x.e->>'title_id')::bigint in (
    select (c->>'title_id')::bigint
    from jsonb_array_elements(v_decks) d, jsonb_array_elements(d->'cards') c);

  return internal.deal_cards(p_room_id, jsonb_build_object(
    'request', jsonb_build_object(
      'kind', case when v_state = 'dealing' then 'start' else 'refill' end,
      'model_version', 'sql-baseline', 'is_fallback', true,
      'room_member_id', p_seat, 'candidates', jsonb_array_length(v_raw)),
    'pool', v_pool,
    'decks', v_decks));
end
$$;

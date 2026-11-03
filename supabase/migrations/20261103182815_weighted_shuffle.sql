-- M5.2: the SQL deal as a weighted shuffle (deck-engine.md#weighted-shuffle,
-- #the-sql-fallback, #building-a-deal).
--
-- internal.shuffle_key(seed, film, score) is a film's place in the draw:
-- score / 0.3 plus Gumbel noise from a hash of the room's seed and the film.
-- Sorting by it, highest first, is a run of draws without replacement where a
-- film's odds are e^(score / 0.3): a film 1 point better is drawn next about 28
-- times as often. The noise depends on the seed and the film only, so a deal can
-- be replayed and every seat gets the same order (Q2.1).
--
-- internal.deal_baseline keeps its signature and replaces the M1.13 version:
--   * candidates: up to 300 from deck_candidates; under 50 above the misery line,
--     the line drops to 0
--   * a start deals 25 cards per seat, the same for every seat: the first 10
--     are the opening, the next 15 ranked; the pool gets those 25 films
--   * a refill tops a seat up to 25 unvoted cards: first the room's pool films
--     the seat has not had, in key order, then new films in key order (Q2.2), so
--     every seat and a late joiner see one sequence
--   * each card logs its propensity: its odds among the films not yet drawn
--   * a refill with nothing to deal answers before deal_cards, as in M1.13

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function internal.shuffle_key(
  p_seed integer,
  p_title_id bigint,
  p_score real,
  p_temperature real default 0.3
) returns double precision
language sql immutable set search_path = ''
as $$
  -- u is in the open interval (0, 1): 52 bits of the hash, plus a half.
  select p_score::double precision / p_temperature::double precision - ln(-ln(h.u))
  from (
    select (('x' || substr(md5(p_seed::text || ':' || p_title_id::text), 1, 13))::bit(52)::bigint::double precision + 0.5)
           / 4503599627370496.0 as u
  ) h
$$;

revoke execute on function internal.shuffle_key(integer, bigint, real, real) from public, anon, authenticated;

create or replace function internal.deal_baseline(p_room_id uuid, p_seat uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_temp constant double precision := 0.3;
  c_deal_size constant integer := 25;
  c_opening constant integer := 10;
  v_state public.room_state;
  v_seed integer;
  v_raw jsonb;
  v_new jsonb;
  v_decks jsonb;
  v_pool jsonb;
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
           'score', x.gs, 'propensity', x.share, 'k', x.k) order by x.k desc, x.title_id), '[]')
  into v_new
  from (
    select y.*, y.w / sum(y.w) over (order by y.k desc, y.title_id rows between current row and unbounded following) as share
    from (
      select (e->>'title_id')::bigint as title_id, (e->>'group_score')::real as gs, (e->>'min_fit')::real as min_fit,
             e->'fits' as fits,
             internal.shuffle_key(v_seed, (e->>'title_id')::bigint, (e->>'group_score')::real) as k,
             exp(((e->>'group_score')::double precision - max((e->>'group_score')::double precision) over ()) / c_temp) as w
      from jsonb_array_elements(v_raw) e
    ) y
  ) x;

  -- Each seat's cards: its pool films first, then the new ones, up to 25 unvoted.
  select coalesce(jsonb_agg(jsonb_build_object('room_member_id', s.id, 'cards', s.cards) order by s.joined_at, s.id), '[]')
  into v_decks
  from (
    select m.id, m.joined_at, cards.cards
    from public.room_members m
    cross join lateral (
      select greatest(c_deal_size - count(*), 0)::integer as n
      from public.deck_entries d
      join public.room_cards rc on rc.room_id = d.room_id and rc.title_id = d.title_id and rc.state = 'active'
      where d.room_member_id = m.id
        and not exists (select 1 from public.votes v where v.room_member_id = m.id and v.title_id = d.title_id)
    ) q
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
               'title_id', z.title_id, 'score', z.score, 'propensity', z.propensity,
               'source', case when v_state = 'dealing' and z.o <= c_opening then 'opening' else 'ranked' end)
             order by z.o), '[]') as cards
      from (
        select u.title_id, u.score, u.propensity,
               row_number() over (order by u.grp, u.k desc, u.title_id) as o
        from (
          select 0 as grp, p.title_id, p.gs as score, p.k,
                 p.w / sum(p.w) over (order by p.k desc, p.title_id rows between current row and unbounded following) as propensity
          from (
            select rc.title_id, rc.group_score as gs,
                   internal.shuffle_key(v_seed, rc.title_id, rc.group_score) as k,
                   exp((rc.group_score::double precision - max(rc.group_score::double precision) over ()) / c_temp) as w
            from public.room_cards rc
            where rc.room_id = p_room_id and rc.state = 'active'
              and not exists (select 1 from public.deck_entries de
                              where de.room_member_id = m.id and de.title_id = rc.title_id)
          ) p
          union all
          select 1, (e->>'title_id')::bigint, (e->>'score')::real, (e->>'k')::double precision, (e->>'propensity')::double precision
          from jsonb_array_elements(v_new) e
        ) u
      ) z
      where z.o <= q.n
    ) cards
    where m.room_id = p_room_id and m.left_at is null and m.removed_at is null
      and (p_seat is null or m.id = p_seat)
      and q.n > 0
  ) s;

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

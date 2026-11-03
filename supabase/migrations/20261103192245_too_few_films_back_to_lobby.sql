-- M5.5: fewer than 20 eligible films at the start sends the room back to the
-- lobby with the reason (game-modes.md#how-a-game-ends, #starting-values).
-- internal.deal_cards is the only writer of decks, so the rule holds for the SQL
-- deal and for the deck worker. New answer: {status: 'too_few_films', eligible}.
-- state_changed carries reason and eligible. Replaces the baseline's version whole;
-- nothing has replaced it since.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function internal.deal_cards(p_room_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_min_films constant integer := 20;   -- game-modes.md#starting-values: too few films to start
  v_state public.room_state;
  v_request_id bigint;
  v_deck jsonb;
  v_seat uuid;
  v_keep integer;
  v_base double precision;
  v_touched uuid[] := '{}';
  v_started boolean := false;
  v_eligible integer;
begin
  select state into v_state from public.rooms where id = p_room_id for no key update;
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
  if v_state = 'dealing' then
    v_eligible := coalesce((p_payload->'request'->>'candidates')::int,
                           jsonb_array_length(coalesce(p_payload->'pool', '[]')));
    if v_eligible < c_min_films then
      update public.rooms set state = 'lobby', dealing_at = null where id = p_room_id;
      perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object(
        'state', 'lobby', 'reason', 'too_few_films', 'eligible', v_eligible));
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
    perform 1 from public.room_members m where m.id = v_seat and m.room_id = p_room_id;
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

    select coalesce(max(d.sort_key), 0) into v_base from public.deck_entries d where d.room_member_id = v_seat;

    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score, request_id)
    select p_room_id, v_seat, (x.c->>'title_id')::bigint, v_base + x.o,
           coalesce(x.c->>'source', 'ranked')::public.deck_source, (x.c->>'score')::real, v_request_id
    from jsonb_array_elements(v_deck->'cards') with ordinality as x(c, o)
    join public.room_cards rc on rc.room_id = p_room_id and rc.title_id = (x.c->>'title_id')::bigint
                              and rc.state = 'active'
    where not exists (select 1 from public.votes v
                      where v.room_member_id = v_seat and v.title_id = (x.c->>'title_id')::bigint)
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

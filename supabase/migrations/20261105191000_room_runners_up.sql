-- M6.48: api.room_runners_up (game-modes.md#after-the-pick, #what-players-see-party-and-blind).
-- After the pick, a seat reads the other finalists, or the most liked films after a single match.
-- Party names who liked each one, Blind gives the count only. Before the pick the answer is
-- not_finished and holds nothing, so swipes never reach other phones while a game runs. The answer
-- never holds a nope, a seen, a total of seats or the seats that did not like a film.
-- Decided: Q48.1 (Party names only the likers), Q48.2 (vetoed finalists are left out), Q48.3
-- (finalists keep their seed order), Q48.4 (no finalists: up to 3 most liked films), Q48.5 (a like,
-- a super like or a rewatch yes is a like; removed seats are left out, seats that left are named).

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function api.room_runners_up(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_pick public.matches;
  v_round public.rounds;
  v_source text;
  v_ids bigint[] := '{}';
  v_result jsonb;
begin
  if p_room_id is null then
    raise exception 'room is required' using errcode = '22023';
  end if;

  -- Members only (removed seats are not), checked before anything about the room is said.
  if not internal.is_room_member(p_room_id) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if v_room.state not in ('done', 'abandoned') then
    return jsonb_build_object('status', 'not_finished');
  end if;

  if v_room.state = 'done' and v_room.mode <> 'solo' then
    select * into v_pick from public.matches where room_id = p_room_id and pick_order = 1;
    if found then
      select * into v_round from public.rounds
      where room_id = p_room_id and winner_title_id = v_pick.title_id
      order by seq desc limit 1;

      if v_round.id is not null then
        v_source := 'finalists';
        select coalesce(array_agg(c.title_id order by c.seed), '{}') into v_ids
        from public.round_candidates c
        where c.round_id = v_round.id and c.vetoed_at is null and c.title_id <> v_pick.title_id;
      elsif v_pick.kind <> 'finale' then
        v_source := 'most_liked';
        select coalesce(array_agg(x.title_id order by x.likes desc, x.score desc, x.title_id), '{}') into v_ids
        from (
          select k.title_id, k.group_score as score,
            (select count(*) from public.votes v
             join public.room_members m on m.id = v.room_member_id and m.removed_at is null
             where v.room_id = p_room_id and v.title_id = k.title_id
               and v.answer in ('like', 'super_like', 'seen_rewatch')) as likes
          from public.room_cards k
          where k.room_id = p_room_id and k.state <> 'dropped' and k.title_id <> v_pick.title_id
        ) x
        where x.likes >= 1
        limit 3;
      end if;
    end if;
  end if;

  -- Per film: the likes, and in Party the seats that liked it, in seat order. The list keeps v_ids order.
  select coalesce(jsonb_agg(
    case when v_room.reveal = 'party' then
      jsonb_build_object('title_id', t.title_id, 'likes', t.likes, 'likers', t.likers)
    else
      jsonb_build_object('title_id', t.title_id, 'likes', t.likes)
    end order by t.o), '[]'::jsonb)
  into v_result
  from (
    select i.title_id, i.o,
      (select count(*) from public.votes v
       join public.room_members m on m.id = v.room_member_id and m.removed_at is null
       where v.room_id = p_room_id and v.title_id = i.title_id
         and v.answer in ('like', 'super_like', 'seen_rewatch')) as likes,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'member_id', m.id, 'display_name', m.display_name, 'avatar_key', m.avatar_key)
              order by m.joined_at, m.id), '[]'::jsonb)
       from public.votes v
       join public.room_members m on m.id = v.room_member_id and m.removed_at is null
       where v.room_id = p_room_id and v.title_id = i.title_id
         and v.answer in ('like', 'super_like', 'seen_rewatch')) as likers
    from unnest(v_ids) with ordinality i(title_id, o)
  ) t;

  return jsonb_build_object('status', 'ok', 'reveal', v_room.reveal, 'source', v_source, 'runners_up', v_result);
end
$$;

revoke execute on function api.room_runners_up(uuid) from public, anon;
grant execute on function api.room_runners_up(uuid) to authenticated;

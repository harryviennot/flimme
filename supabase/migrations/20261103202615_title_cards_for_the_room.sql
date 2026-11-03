-- M5.9: api.title_cards serves only films in the caller's room (security.md#the-database-gaps-found,
-- gap 2). Before, any film id came back for any country with no limit, so a guest could copy the
-- catalog and its availability. Now: (room, ids, language), the room's pool in any state (active,
-- dropped, matched, finalist), country, services, offer kinds and age cap from the room through
-- internal.card_payloads(uuid, bigint[], text), 50 films a call (more is refused, not truncated), 30
-- calls per 10 minutes per profile. Answers: ok, too_many, rate_limited. A caller without a seat
-- (or a removed seat) raises 42501; a seat that left keeps reading. Replaced in place, not as _v2:
-- nothing calls the old one. The old four-argument card_payloads goes too. The taste check pool is
-- not in room_cards, so it is not served here (api.taste_check_cards will).

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- squawk-ignore ban-drop-function
drop function api.title_cards(bigint[], text, char);
-- squawk-ignore ban-drop-function
drop function internal.card_payloads(bigint[], text, char, integer[]);

create function api.title_cards(p_room_id uuid, p_title_ids bigint[], p_language text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_cards jsonb;
begin
  if v_profile is null or not internal.is_room_member(p_room_id) then
    raise exception 'not in this room' using errcode = '42501';
  end if;

  -- Checked before the rate limit, so a refused call costs nothing.
  if coalesce(cardinality(p_title_ids), 0) > 50 then
    return jsonb_build_object('status', 'too_many', 'max', 50);
  end if;

  if not internal.rate_limit('title_cards:p:' || v_profile, 30, interval '10 minutes') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(cp.card order by array_position(p_title_ids, cp.title_id)), '[]')
  into v_cards
  from internal.card_payloads(
    p_room_id,
    coalesce((
      select array_agg(c.title_id)
      from public.room_cards c
      where c.room_id = p_room_id and c.title_id = any (p_title_ids)), '{}'),
    coalesce(p_language, (select p.language from public.profiles p where p.id = v_profile), 'en')
  ) cp;

  return jsonb_build_object('status', 'ok', 'cards', v_cards);
end
$$;

revoke execute on function api.title_cards(uuid, bigint[], text) from public, anon;
grant execute on function api.title_cards(uuid, bigint[], text) to authenticated;

-- M4.4: api.create_room takes the room settings, so opening a room is one call
-- (app-structure.md#changes-this-asks-of-the-backend). The settings are checked by
-- internal.room_settings_error, exactly as api.update_room_settings checks them, and a refused
-- call creates nothing. Harry's answers of 3 Nov 2026: Q4.1 to Q4.6 defaults stand.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- An overload would make PostgREST calls ambiguous, so the two-argument version goes first.
-- The new one accepts every old call (both extra arguments have defaults).
-- squawk-ignore ban-drop-function
drop function api.create_room(text, char);

create function api.create_room(
  p_mode text default 'quick_match',
  p_country char(2) default null,
  p_settings jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_mode public.game_modes;
  v_room public.rooms;
  v_country char(2);
  v_field text;
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

  -- No settings means the mode's and the column defaults. A given object is checked whole.
  if p_settings is not null then
    v_field := internal.room_settings_error(p_settings);
    if v_field is not null then
      return jsonb_build_object('status', 'invalid_settings', 'field', v_field);
    end if;
  end if;

  -- Later: the monthly hosting cap and the room's tier are decided here.

  for i in 1..10 loop
    begin
      -- A key in p_settings wins, then the mode's defaults, then the column default.
      insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, quality,
                                service_rule, reveal, runtime_max, max_age)
      values (
        internal.new_room_code(),
        v_profile.id, v_mode.slug, v_country, v_mode.max_players,
        coalesce((p_settings->>'seen_rule')::public.seen_rule,
                 (v_mode.defaults->>'seen_rule')::public.seen_rule, 'hide_seen'),
        coalesce((p_settings->>'quality')::public.quality_preset,
                 (v_mode.defaults->>'quality')::public.quality_preset, 'standard'),
        coalesce((p_settings->>'service_rule')::public.service_rule, 'any_member'),
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

  insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key, provider_ids)
  values (
    v_room.id, v_profile.id, v_profile.id, 'host', v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}')
  );
  insert into public.room_models (room_id) values (v_room.id);
  -- After the settings are on the row: it reads service_rule. No broadcast, nobody listens yet.
  perform internal.refresh_room_providers(v_room.id);

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'code', v_room.code);
end
$$;

revoke execute on function api.create_room(text, char, jsonb) from public, anon;
grant execute on function api.create_room(text, char, jsonb) to authenticated;

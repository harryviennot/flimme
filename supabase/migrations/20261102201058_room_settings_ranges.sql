-- M1.10: api.update_room_settings checks ranges and broadcasts the saved values (security.md,
-- the database gaps found, gap 5). Harry's answers of 2 Nov 2026: runtime_max is null or 40 to 240,
-- max_age is null or 0 to 18, and a refusal is the status invalid_settings with the field.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The first invalid key of a settings object, or null when all are valid. Unknown keys are
-- ignored; so is a json null on an enum key (it leaves the setting as it is). Never raises on a
-- bad value: wrong types are answered, not cast. Only api.update_room_settings calls it (M4.4
-- reuses it for create_room), so no one else may execute it.
create function internal.room_settings_error(p_settings jsonb) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_number numeric;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    return 'settings';
  end if;

  -- null, or a whole number from the catalog floor (40 minutes) to 4 hours
  if p_settings ? 'runtime_max' and jsonb_typeof(p_settings->'runtime_max') <> 'null' then
    if jsonb_typeof(p_settings->'runtime_max') <> 'number' then
      return 'runtime_max';
    end if;
    v_number := (p_settings->>'runtime_max')::numeric;
    if v_number <> trunc(v_number) or v_number not between 40 and 240 then
      return 'runtime_max';
    end if;
  end if;

  -- null, or a whole number from 0 to 18 (France's certifications top out at 18)
  if p_settings ? 'max_age' and jsonb_typeof(p_settings->'max_age') <> 'null' then
    if jsonb_typeof(p_settings->'max_age') <> 'number' then
      return 'max_age';
    end if;
    v_number := (p_settings->>'max_age')::numeric;
    if v_number <> trunc(v_number) or v_number not between 0 and 18 then
      return 'max_age';
    end if;
  end if;

  if p_settings ? 'service_rule' and jsonb_typeof(p_settings->'service_rule') <> 'null' then
    if jsonb_typeof(p_settings->'service_rule') <> 'string'
       or not ((p_settings->>'service_rule') = any (enum_range(null::public.service_rule)::text[])) then
      return 'service_rule';
    end if;
  end if;
  if p_settings ? 'seen_rule' and jsonb_typeof(p_settings->'seen_rule') <> 'null' then
    if jsonb_typeof(p_settings->'seen_rule') <> 'string'
       or not ((p_settings->>'seen_rule') = any (enum_range(null::public.seen_rule)::text[])) then
      return 'seen_rule';
    end if;
  end if;
  if p_settings ? 'quality' and jsonb_typeof(p_settings->'quality') <> 'null' then
    if jsonb_typeof(p_settings->'quality') <> 'string'
       or not ((p_settings->>'quality') = any (enum_range(null::public.quality_preset)::text[])) then
      return 'quality';
    end if;
  end if;
  if p_settings ? 'reveal' and jsonb_typeof(p_settings->'reveal') <> 'null' then
    if jsonb_typeof(p_settings->'reveal') <> 'string'
       or not ((p_settings->>'reveal') = any (enum_range(null::public.reveal_mode)::text[])) then
      return 'reveal';
    end if;
  end if;

  return null;
end
$$;

revoke execute on function internal.room_settings_error(jsonb) from public, anon, authenticated;

-- Host only, lobby only. Keys left out of p_settings stay as they are. Invalid settings are
-- answered (invalid_settings, with the field) and nothing is saved or sent. What is broadcast is
-- what the room row holds after the update, never the input.
create or replace function api.update_room_settings(p_room_id uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_field text;
  v_room public.rooms;
begin
  select state into v_state from public.rooms r
  where r.id = p_room_id
    and exists (select 1 from public.room_members m
                where m.room_id = r.id and m.role = 'host' and m.profile_id = internal.my_profile_id()
                  and m.left_at is null)
  for no key update;
  if not found then
    raise exception 'only the host can change settings' using errcode = '42501';
  end if;
  if v_state <> 'lobby' then
    return jsonb_build_object('status', 'closed');
  end if;

  v_field := internal.room_settings_error(p_settings);
  if v_field is not null then
    return jsonb_build_object('status', 'invalid_settings', 'field', v_field);
  end if;

  update public.rooms
  set service_rule = coalesce((p_settings->>'service_rule')::public.service_rule, service_rule),
      runtime_max = case when p_settings ? 'runtime_max' then trunc((p_settings->>'runtime_max')::numeric)::smallint else runtime_max end,
      seen_rule = coalesce((p_settings->>'seen_rule')::public.seen_rule, seen_rule),
      quality = coalesce((p_settings->>'quality')::public.quality_preset, quality),
      max_age = case when p_settings ? 'max_age' then trunc((p_settings->>'max_age')::numeric)::smallint else max_age end,
      reveal = coalesce((p_settings->>'reveal')::public.reveal_mode, reveal)
  where id = p_room_id
  returning * into v_room;
  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'settings_changed', jsonb_build_object(
    'service_rule', v_room.service_rule,
    'runtime_max', v_room.runtime_max,
    'seen_rule', v_room.seen_rule,
    'quality', v_room.quality,
    'max_age', v_room.max_age,
    'reveal', v_room.reveal
  ));
  return jsonb_build_object('status', 'ok');
end
$$;

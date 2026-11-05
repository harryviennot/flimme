-- M4.4: api.create_room takes the room settings, checked as api.update_room_settings checks them
-- (internal.room_settings_error). T1 to T12 follow the brief's numbered tests.

begin;
select plan(38);

select tests.create_player('host');
select tests.create_player('unnamed');
update public.profiles set display_name = '' where id = tests.uid('unnamed');
select tests.create_provider(8, 'Alpha');
select tests.create_provider(9, 'Beta');
insert into public.profile_providers (profile_id, provider_id) values (tests.uid('host'), 8), (tests.uid('host'), 9);

-- Creates a room as the host and answers the status.
create function pg_temp.open(p_mode text, p_settings jsonb) returns jsonb
language plpgsql as $$
declare
  v_answer jsonb;
begin
  perform tests.authenticate_as('host');
  v_answer := api.create_room(p_mode, 'FR', p_settings);
  perform tests.clear_authentication();
  return v_answer;
end
$$;

-- The six settings of a room, as one line.
create function pg_temp.row_of(p_answer jsonb) returns text
language sql as $$
  select concat_ws('|', service_rule, coalesce(runtime_max::text, 'null'), seen_rule, quality,
                   coalesce(max_age::text, 'null'), reveal)
  from public.rooms where id = (p_answer->>'room_id')::uuid
$$;

create function pg_temp.counts() returns text
language sql as $$
  select (select count(*) from public.rooms)::text || '|' || (select count(*) from public.room_members)::text
    || '|' || (select count(*) from public.room_models)::text
$$;

create function pg_temp.refused(p_settings jsonb, p_field text) returns text
language plpgsql as $$
declare
  v_before text := pg_temp.counts();
  v_answer jsonb := pg_temp.open('quick_match', p_settings);
begin
  if v_answer is distinct from jsonb_build_object('status', 'invalid_settings', 'field', p_field) then
    return 'answered ' || coalesce(v_answer::text, 'null');
  end if;
  if pg_temp.counts() <> v_before then
    return 'something was created';
  end if;
  return 'ok';
end
$$;

-- T1: two keys given, the other four at their defaults.
create temp table a1 as select pg_temp.open('quick_match', '{"runtime_max":105,"max_age":12}') as a;
select is((select a->>'status' from a1), 'ok', 'T1 a room opens with two settings');
select is(pg_temp.row_of((select a from a1)), 'any_member|105|allow_rewatch|standard|12|party', 'T1 the room holds both, the rest are defaults');

-- T2: all six keys.
create temp table a2 as select pg_temp.open('quick_match',
  '{"service_rule":"every_member","runtime_max":120,"seen_rule":"show_all","quality":"hidden_gems","max_age":0,"reveal":"blind"}') as a;
select is((select a->>'status' from a2), 'ok', 'T2 a room opens with all six settings');
select is(pg_temp.row_of((select a from a2)), 'every_member|120|show_all|hidden_gems|0|blind', 'T2 the row holds all six');

-- T3: null and {} leave the room as before M4.4.
create temp table a3 as select pg_temp.open('quick_match', null) as a;
create temp table a3b as select pg_temp.open('quick_match', '{}') as a;
select is(pg_temp.row_of((select a from a3)), 'any_member|null|allow_rewatch|standard|null|party', 'T3 null settings give the defaults');
select is(pg_temp.row_of((select a from a3b)), 'any_member|null|allow_rewatch|standard|null|party', 'T3 empty settings give the defaults');

-- T4: a key beats the mode's default; json null on an enum leaves the mode's default.
select is(pg_temp.row_of(pg_temp.open('date_night', '{"seen_rule":"allow_rewatch"}')),
  'any_member|null|allow_rewatch|standard|null|party', 'T4 a given seen_rule beats the mode default');
select is(pg_temp.row_of(pg_temp.open('date_night', '{"seen_rule":null}')),
  'any_member|null|hide_seen|standard|null|party', 'T4 json null on seen_rule keeps the mode default');
select is(pg_temp.row_of(pg_temp.open('quick_match', '{"quality":null,"reveal":null,"service_rule":null}')),
  'any_member|null|allow_rewatch|standard|null|party', 'T4 json null on the other enums keeps the defaults');

-- T5: json null on the limits stores null.
create temp table a5 as select pg_temp.open('quick_match', '{"runtime_max":null,"max_age":null}') as a;
select is((select a->>'status' from a5), 'ok', 'T5 null limits are accepted');
select is(pg_temp.row_of((select a from a5)), 'any_member|null|allow_rewatch|standard|null|party', 'T5 both limits are null');

-- T6: each refused value answers invalid_settings with its field (and creates nothing: T7).
select is(pg_temp.refused('{"runtime_max":39}', 'runtime_max'), 'ok', 'T6 runtime_max 39');
select is(pg_temp.refused('{"runtime_max":241}', 'runtime_max'), 'ok', 'T6 runtime_max 241');
select is(pg_temp.refused('{"runtime_max":104.5}', 'runtime_max'), 'ok', 'T6 runtime_max 104.5');
select is(pg_temp.refused('{"runtime_max":"105"}', 'runtime_max'), 'ok', 'T6 runtime_max "105"');
select is(pg_temp.refused('{"max_age":-1}', 'max_age'), 'ok', 'T6 max_age -1');
select is(pg_temp.refused('{"max_age":19}', 'max_age'), 'ok', 'T6 max_age 19');
select is(pg_temp.refused('{"seen_rule":"x"}', 'seen_rule'), 'ok', 'T6 seen_rule x');
select is(pg_temp.refused('{"reveal":1}', 'reveal'), 'ok', 'T6 reveal 1');
select is(pg_temp.refused('{"quality":"x"}', 'quality'), 'ok', 'T6 quality x');
select is(pg_temp.refused('{"service_rule":"x"}', 'service_rule'), 'ok', 'T6 service_rule x');
select is(pg_temp.refused('[]', 'settings'), 'ok', 'T6 an array is field settings');
select is(pg_temp.refused('"x"', 'settings'), 'ok', 'T6 a string is field settings');

-- T7: a refused call leaves the counts alone.
create temp table c7 as select pg_temp.counts() as c;
select pg_temp.open('quick_match', '{"max_age":99}');
select is(pg_temp.counts(), (select c from c7), 'T7 no room, seat or room_models row after a refusal');

-- T8: earlier answers come first.
select tests.authenticate_as('unnamed');
select is(api.create_room('quick_match', 'FR', '{"max_age":99}'), jsonb_build_object('status', 'name_required'),
  'T8 an unnamed player gets name_required before invalid_settings');
select tests.authenticate_as('host');
select is(api.create_room('nope', 'FR', '{"max_age":99}'), jsonb_build_object('status', 'unknown_mode'),
  'T8 an unknown mode gets unknown_mode before invalid_settings');
select tests.clear_authentication();
update public.profiles set country = null where id = tests.uid('host');
select tests.authenticate_as('host');
select is(api.create_room('quick_match', null, '{"max_age":99}'), jsonb_build_object('status', 'country_required'),
  'T8 no country gets country_required before invalid_settings');
select tests.clear_authentication();
update public.profiles set country = 'FR' where id = tests.uid('host');

-- T9: unknown keys are ignored.
create temp table a9 as select pg_temp.open('quick_match', '{"colour":"red","max_age":10}') as a;
select is((select a->>'status' from a9), 'ok', 'T9 an unknown key does not refuse the call');
select is(pg_temp.row_of((select a from a9)), 'any_member|null|allow_rewatch|standard|10|party', 'T9 the known key is kept');

-- T10: providers are computed once the settings are on the row (the host's services here).
create temp table a10 as select pg_temp.open('quick_match', '{"service_rule":"every_member"}') as a;
select is((select provider_ids @> array[8, 9]
  from public.rooms r where r.id = (select (a->>'room_id')::uuid from a10)),
  true, 'T10 provider_ids hold the host services under every_member');
select is((select provider_ids @> array[8, 9]
  from public.rooms r where r.id = (select (a->>'room_id')::uuid from a3)),
  true, 'T10 and under any_member');

-- T11: nobody is subscribed yet, so nothing is broadcast.
select is((select count(*) from tests.broadcasts((select (a->>'room_id')::uuid from a1), 'settings_changed')),
  0::bigint, 'T11 no settings_changed for a new room');

-- T12: one function, the right grants, the old call shapes still work.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'api' and p.proname = 'create_room'), 1::bigint, 'T12 exactly one api.create_room');
select is(has_function_privilege('authenticated', 'api.create_room(text, character, jsonb)', 'execute'), true,
  'T12 authenticated can execute it');
select is(has_function_privilege('anon', 'api.create_room(text, character, jsonb)', 'execute'), false, 'T12 anon cannot');
select is(has_function_privilege('public', 'api.create_room(text, character, jsonb)', 'execute'), false, 'T12 public cannot');
select tests.authenticate_as('host');
select is((api.create_room('quick_match', 'FR'))->>'status', 'ok', 'T12 the two-argument positional call still answers ok');
select is((api.create_room())->>'status', 'ok', 'T12 the call with no arguments still answers ok');
select tests.clear_authentication();

select * from finish();
rollback;

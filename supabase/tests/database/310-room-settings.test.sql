-- M1.10: api.update_room_settings checks ranges and broadcasts the saved values (security.md gap 5).
-- Harry's answers of 2 Nov 2026: runtime_max null or 40 to 240, max_age null or 0 to 18, and a
-- refusal is the status invalid_settings with the field.

begin;
select plan(46);

select tests.create_room(2, 'quick_match', 'FR', 'r');

-- A refusal: the answer, then the room as it was and no new broadcast.
create or replace function pg_temp.refused(p_settings jsonb, p_field text) returns text
language plpgsql
as $$
declare
  v_answer jsonb;
  v_before text;
  v_after text;
  v_sent_before bigint;
begin
  select count(*) into v_sent_before from tests.broadcasts(tests.room_id(), 'settings_changed');
  select to_jsonb(r)::text into v_before from public.rooms r where r.id = tests.room_id();
  perform tests.authenticate_as('r1');
  v_answer := api.update_room_settings(tests.room_id(), p_settings);
  perform tests.clear_authentication();
  select to_jsonb(r)::text into v_after from public.rooms r where r.id = tests.room_id();
  if v_answer is distinct from jsonb_build_object('status', 'invalid_settings', 'field', p_field) then
    return 'answered ' || coalesce(v_answer::text, 'null');
  end if;
  if v_before is distinct from v_after then
    return 'the room changed';
  end if;
  if (select count(*) from tests.broadcasts(tests.room_id(), 'settings_changed')) <> v_sent_before then
    return 'something was broadcast';
  end if;
  return 'ok';
end
$$;

-- T1: runtime_max outside 40 to 240.
select is(pg_temp.refused('{"runtime_max":39}', 'runtime_max'), 'ok', 'T1 runtime_max 39 is refused');
select is(pg_temp.refused('{"runtime_max":241}', 'runtime_max'), 'ok', 'T1 runtime_max 241 is refused');
select is(pg_temp.refused('{"runtime_max":0}', 'runtime_max'), 'ok', 'T1 runtime_max 0 is refused');
select is(pg_temp.refused('{"runtime_max":-5}', 'runtime_max'), 'ok', 'T1 runtime_max -5 is refused');
select is(pg_temp.refused('{"runtime_max":100000}', 'runtime_max'), 'ok', 'T1 runtime_max 100000 is refused with no overflow error');
select is(pg_temp.refused('{"runtime_max":"abc"}', 'runtime_max'), 'ok', 'T1 a non-numeric runtime_max is refused with no cast error');
select is(pg_temp.refused('{"runtime_max":90.5}', 'runtime_max'), 'ok', 'T1 a fractional runtime_max is refused');

-- T2: max_age outside 0 to 18.
select is(pg_temp.refused('{"max_age":-1}', 'max_age'), 'ok', 'T2 max_age -1 is refused');
select is(pg_temp.refused('{"max_age":19}', 'max_age'), 'ok', 'T2 max_age 19 is refused');
select is(pg_temp.refused('{"max_age":70000}', 'max_age'), 'ok', 'T2 max_age 70000 is refused with no overflow error');
select is(pg_temp.refused('{"max_age":"old"}', 'max_age'), 'ok', 'T2 a non-numeric max_age is refused with no cast error');

-- T3: values outside the enums.
select is(pg_temp.refused('{"seen_rule":"nope"}', 'seen_rule'), 'ok', 'T3 a bad seen_rule is refused, not raised');
select is(pg_temp.refused('{"quality":"nope"}', 'quality'), 'ok', 'T3 a bad quality is refused, not raised');
select is(pg_temp.refused('{"reveal":"nope"}', 'reveal'), 'ok', 'T3 a bad reveal is refused, not raised');
select is(pg_temp.refused('{"service_rule":"nope"}', 'service_rule'), 'ok', 'T3 a bad service_rule is refused, not raised');
select is(pg_temp.refused('{"seen_rule":5}', 'seen_rule'), 'ok', 'T3 a non-string seen_rule is refused, not raised');

-- T4: one bad key next to valid ones saves nothing.
select is(
  pg_temp.refused('{"seen_rule":"show_all","quality":"hidden_gems","runtime_max":120,"max_age":99}', 'max_age'),
  'ok',
  'T4 one bad key next to valid ones is refused as a whole and nothing is saved'
);
select is(
  (select r.seen_rule::text || '/' || r.quality::text from public.rooms r where r.id = tests.room_id()),
  'allow_rewatch/standard',
  'T4 the valid keys were not saved'
);

-- T5: every value the host screen sends is saved.
select tests.authenticate_as('r1');
select is((select api.update_room_settings(tests.room_id(), '{"runtime_max":105}')->>'status'), 'ok', 'T5 runtime_max 105 answers ok');
select tests.clear_authentication();
select is((select r.runtime_max from public.rooms r where r.id = tests.room_id()), 105::smallint, 'T5 runtime_max 105 is saved');
select tests.authenticate_as('r1');
select is((select api.update_room_settings(tests.room_id(), '{"runtime_max":120}')->>'status'), 'ok', 'T5 runtime_max 120 answers ok');
select tests.clear_authentication();
select is((select r.runtime_max from public.rooms r where r.id = tests.room_id()), 120::smallint, 'T5 runtime_max 120 is saved');
select tests.authenticate_as('r1');
select is((select api.update_room_settings(tests.room_id(), '{"runtime_max":null}')->>'status'), 'ok', 'T5 runtime_max null answers ok');
select tests.clear_authentication();
select is((select r.runtime_max from public.rooms r where r.id = tests.room_id()), null::smallint, 'T5 runtime_max null is saved');

select tests.authenticate_as('r1');
select is((select api.update_room_settings(tests.room_id(), '{"runtime_max":40}')->>'status'), 'ok', 'T5 the lowest runtime_max, 40, answers ok');
select is((select api.update_room_settings(tests.room_id(), '{"runtime_max":240}')->>'status'), 'ok', 'T5 the highest runtime_max, 240, answers ok');
select tests.clear_authentication();
select is((select r.runtime_max from public.rooms r where r.id = tests.room_id()), 240::smallint, 'T5 runtime_max 240 is saved');

create or replace function pg_temp.age_saved(p_age text) returns text
language plpgsql
as $$
declare
  v_answer text;
  v_saved smallint;
begin
  perform tests.authenticate_as('r1');
  v_answer := api.update_room_settings(tests.room_id(), jsonb_build_object('max_age', p_age::jsonb))->>'status';
  perform tests.clear_authentication();
  select r.max_age into v_saved from public.rooms r where r.id = tests.room_id();
  return v_answer || '/' || coalesce(v_saved::text, 'null');
end
$$;
select is(pg_temp.age_saved('16'), 'ok/16', 'T5 max_age 16 is saved');
select is(pg_temp.age_saved('12'), 'ok/12', 'T5 max_age 12 is saved');
select is(pg_temp.age_saved('10'), 'ok/10', 'T5 max_age 10 is saved');
select is(pg_temp.age_saved('0'), 'ok/0', 'T5 max_age 0 is saved');
select is(pg_temp.age_saved('18'), 'ok/18', 'T5 max_age 18 is saved');
select is(pg_temp.age_saved('null'), 'ok/null', 'T5 max_age null is saved');
select is(pg_temp.age_saved('16.0'), 'ok/16', 'T5 a whole max_age written 16.0 is saved, with no cast error');
select tests.authenticate_as('r1');
select is(
  (select api.update_room_settings(tests.room_id(), '{"runtime_max":105.0}')->>'status'),
  'ok',
  'T5 a whole runtime_max written 105.0 answers ok, with no cast error'
);
select tests.clear_authentication();

-- T6: the broadcast carries the six saved values, untouched ones included.
select tests.create_room(2, 'quick_match', 'FR', 'b');
select tests.authenticate_as('b1');
select api.update_room_settings(tests.room_id(), '{"quality":"hidden_gems"}');
select tests.clear_authentication();
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'settings_changed')),
  1::bigint,
  'T6 one settings_changed was broadcast'
);
select is(
  (select array_agg(k order by k) from tests.broadcasts(tests.room_id(), 'settings_changed') p, jsonb_object_keys(p) k where k <> 'id'),
  array['max_age', 'quality', 'reveal', 'runtime_max', 'seen_rule', 'service_rule'],
  'T6 the broadcast carries exactly the six setting keys'
);
select is(
  (select p->>'quality' from tests.broadcasts(tests.room_id(), 'settings_changed') p),
  'hidden_gems',
  'T6 the broadcast carries the value just saved'
);
select is(
  (select (p->>'seen_rule') || '/' || (p->>'service_rule') || '/' || (p->>'reveal')
   from tests.broadcasts(tests.room_id(), 'settings_changed') p),
  'allow_rewatch/any_member/party',
  'T6 the broadcast carries the untouched values read back from the room'
);
select is(
  (select jsonb_typeof(p->'runtime_max') || '/' || jsonb_typeof(p->'max_age') from tests.broadcasts(tests.room_id(), 'settings_changed') p),
  'null/null',
  'T6 an unset runtime_max and max_age are broadcast as null'
);

-- T7: an extra key never reaches the phones.
select tests.authenticate_as('b1');
select is(
  (select api.update_room_settings(tests.room_id(), '{"seen_rule":"allow_rewatch","x":"<b>hi</b>"}')->>'status'),
  'ok',
  'T7 an unknown key next to valid ones is ignored and the call answers ok'
);
select tests.clear_authentication();
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'settings_changed') p where p ? 'x' or p::text like '%<b>%'),
  0::bigint,
  'T7 the extra key never appears in a broadcast'
);

-- T8: a refused call broadcasts nothing (also checked inside every refusal above).
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'settings_changed')),
  2::bigint,
  'T8 only the two accepted calls were broadcast'
);
select tests.authenticate_as('b1');
select api.update_room_settings(tests.room_id(), '{"max_age":99}');
select tests.clear_authentication();
select is(
  (select count(*) from tests.broadcasts(tests.room_id(), 'settings_changed')),
  2::bigint,
  'T8 a refused call adds no broadcast'
);

-- Unchanged: a guest is still refused with 42501, even with bad settings.
select tests.authenticate_as('b2');
select throws_ok(
  $$select api.update_room_settings(tests.room_id(), '{"max_age":99}')$$,
  '42501', null,
  'a guest with bad settings still gets 42501'
);
select tests.clear_authentication();

-- The helper is not callable by phones.
select ok(
  not has_function_privilege('authenticated', 'internal.room_settings_error(jsonb)', 'execute')
  and not has_function_privilege('anon', 'internal.room_settings_error(jsonb)', 'execute'),
  'internal.room_settings_error is not executable by phones'
);

select * from finish();
rollback;

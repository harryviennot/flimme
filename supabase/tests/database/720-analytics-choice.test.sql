-- M8.12: api.set_analytics_choice and the legal links in app_config
-- (analytics.md#analytics-consent, privacy.md#consents).

begin;
select plan(28);

select tests.create_player('a1');
select tests.create_player('a2');
select tests.create_player('a3');

create function pg_temp.choose(p_who text, p_choice public.analytics_choice, p_version text default 'wording-1')
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_who);
  v := api.set_analytics_choice(p_choice, p_version);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.active(p_who text) returns bigint language sql as $$
  select count(*) from public.consents
  where profile_id = tests.uid(p_who) and kind = 'analytics' and revoked_at is null
$$;

-- T1: no row yet, then off.
select is(pg_temp.choose('a1', 'off', 'wording-1'), '{"status": "ok", "choice": "off"}'::jsonb, 'T1 choosing off answers ok with the choice');
select is(pg_temp.active('a1'), 1::bigint, 'T1 one active analytics row');
select is((select choice::text || '/' || version from public.consents
           where profile_id = tests.uid('a1') and kind = 'analytics' and revoked_at is null),
          'off/wording-1', 'T1 the row holds the choice and the wording version');

-- T2: then detailed.
select is(pg_temp.choose('a1', 'detailed', 'wording-2')->>'status', 'ok', 'T2 changing to detailed answers ok');
select is((select count(*) from public.consents where profile_id = tests.uid('a1') and kind = 'analytics'),
          2::bigint, 'T2 history is kept: two rows');
select ok((select revoked_at is not null from public.consents
           where profile_id = tests.uid('a1') and kind = 'analytics' and choice = 'off'), 'T2 the off row is revoked');
select is((select choice::text from public.consents
           where profile_id = tests.uid('a1') and kind = 'analytics' and revoked_at is null),
          'detailed', 'T2 the active row is detailed');

-- T3: the same choice again writes nothing.
select is(pg_temp.choose('a1', 'detailed', 'wording-3')->>'status', 'ok', 'T3 the same choice answers ok');
select is((select count(*) from public.consents where profile_id = tests.uid('a1') and kind = 'analytics'),
          2::bigint, 'T3 no new row');
select is((select version from public.consents
           where profile_id = tests.uid('a1') and kind = 'analytics' and revoked_at is null),
          'wording-2', 'T3 the active row is untouched');

-- T4: version out of range.
select is(pg_temp.choose('a2', 'off', '')->>'status', 'invalid', 'T4 an empty version is invalid');
select is(pg_temp.choose('a2', 'off', repeat('x', 41))->>'status', 'invalid', 'T4 41 characters is invalid');
select is((select count(*) from public.consents where profile_id = tests.uid('a2')), 0::bigint,
          'T4 nothing written by the invalid calls');
select is(pg_temp.choose('a2', 'off', repeat('x', 40))->>'status', 'ok', 'T4 40 characters is fine');

-- T5: 20 calls an hour, the 21st is rate limited. a3 alternates so each call counts.
select pg_temp.choose('a3', (case when n % 2 = 0 then 'off' else 'on' end)::public.analytics_choice)
from generate_series(1, 20) n;
select is(pg_temp.choose('a3', 'detailed')->>'status', 'rate_limited', 'T5 the 21st call in an hour is rate_limited');

-- T6: the check on consents.
select throws_ok(
  $$ insert into public.consents (profile_id, kind, version, choice)
     values (tests.uid('a2'), 'letterboxd_import', 'v', 'on') $$,
  '23514', null, 'T6 a non-analytics row cannot carry a choice');
select throws_ok(
  $$ insert into public.consents (profile_id, kind, version)
     values (tests.uid('a2'), 'analytics', 'v') $$,
  '23514', null, 'T6 an analytics row needs a choice');
select lives_ok(
  $$ insert into public.consents (profile_id, kind, version)
     values (tests.uid('a2'), 'letterboxd_import', 'v') $$,
  'T6 a non-analytics row without a choice is fine');

-- T7: other players untouched.
select is((select count(*) from public.consents where profile_id = tests.uid('a2') and kind = 'analytics'), 1::bigint,
          'T7 another player''s rows are untouched');

-- T8: the export shows the choice.
select tests.authenticate_as('a2');
create temp table a2_export as select api.export_my_data() as e;
select tests.clear_authentication();
select is((select c->>'choice' from a2_export, jsonb_array_elements(e->'consents') c where c->>'kind' = 'analytics'),
          'off', 'T8 the export''s consents carry the choice');

-- T9: who may execute.
select is(has_function_privilege('anon', 'api.set_analytics_choice(public.analytics_choice, text)', 'execute'), false, 'T9 anon cannot execute');
select is(has_function_privilege('app_server', 'api.set_analytics_choice(public.analytics_choice, text)', 'execute'), false, 'T9 app_server cannot execute');
select is(has_function_privilege('app_http', 'api.set_analytics_choice(public.analytics_choice, text)', 'execute'), false, 'T9 app_http cannot execute');
select is(has_function_privilege('authenticated', 'api.set_analytics_choice(public.analytics_choice, text)', 'execute'), true, 'T9 authenticated can execute');

-- No profile: an access error, not an answer.
select throws_ok($$ select api.set_analytics_choice('off', 'v') $$, '42501', null, 'T9 no profile raises 42501');

-- T10: the legal links, as a player.
select tests.authenticate_as('a1');
select is((select value->'privacy'->>'fr' from api.app_config where key = 'legal_urls'),
          'https://flimme.com/fr/confidentialite', 'T10 privacy link, French');
select is((select count(*) from api.app_config c, jsonb_each(c.value) k, jsonb_each_text(k.value) l
           where c.key = 'legal_urls' and jsonb_typeof(k.value) = 'object'),
          6::bigint, 'T10 six links');
select is((select value->>'support_email' from api.app_config where key = 'legal_urls'),
          'support@flimme.com', 'T10 the support address');
select tests.clear_authentication();

select * from finish();
rollback;

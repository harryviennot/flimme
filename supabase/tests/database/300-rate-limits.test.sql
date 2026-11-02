-- M1.9: one rate limit helper, per profile and per address
-- (security.md#room-codes-joining-and-the-host layers 1 and 2, gaps 6 and 7;
-- security.md#starting-values). Nothing waits: now() is fixed inside a
-- transaction, so every attempt below falls in one window.
--
-- The address comes from request.headers, which the Data API sets and the SQL
-- editor does not; the tests set it with set_config. Q9.2: cf-connecting-ip, else
-- the last x-forwarded-for entry, never the first.

begin;
select plan(37);

-- One attempt as a named player, back to the superuser afterwards, so a query
-- can run many attempts in a row. The answer is the status.
create function pg_temp.try_join(p_name text, p_code text) returns text
language plpgsql
as $$
declare v_status text;
begin
  perform tests.authenticate_as(p_name);
  v_status := api.join_room(p_code)->>'status';
  perform tests.clear_authentication();
  return v_status;
end
$$;

select tests.create_room(2);   -- the real code, room of p1 and p2
select set_config('request.headers', '', true);

-- T1: the 11th join attempt in a window is refused, even with the real code.
select tests.create_player('t1');
select is(
  (select count(*) filter (where pg_temp.try_join('t1', tests.room_code()) = 'ok') from generate_series(1, 10)),
  10::bigint, 'T1 ten attempts by one profile are answered ok (the seat, then rejoins)');
select is(pg_temp.try_join('t1', tests.room_code()), 'rate_limited',
  'T1 the 11th attempt by one profile answers rate_limited, with the real code');

-- T2: failed attempts count more: 5 not_found, then rate_limited.
select tests.create_player('t2a');
select tests.create_player('t2b');
select is(
  (select count(*) filter (where pg_temp.try_join('t2a', '000000') = 'not_found') from generate_series(1, 5)),
  5::bigint, 'T2 five wrong codes each answer not_found');
select is(pg_temp.try_join('t2a', tests.room_code()), 'rate_limited',
  'T2 the 6th attempt answers rate_limited even with the real code');
select is((select count(*) from public.room_members where profile_id = tests.uid('t2a')), 0::bigint,
  'T2 the refused player has no seat');
select is(
  (select count(*) filter (where pg_temp.try_join('t2b', '000000') = 'not_found') from generate_series(1, 4)),
  4::bigint, 'T2 four wrong codes each answer not_found');
select is(pg_temp.try_join('t2b', '000000'), 'not_found',
  'T2 given 4 failures, a 5th wrong code still answers not_found');
select is(pg_temp.try_join('t2b', tests.room_code()), 'rate_limited',
  'T2 and after the 5th failure the real code is refused');

-- T3: 30 attempts from one address across fresh profiles, then the 31st is refused.
select tests.create_player('a' || g) from generate_series(1, 31) g;
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.9"}', true);
select is(
  (select count(*) filter (where pg_temp.try_join('a' || g, '000000') = 'not_found') from generate_series(1, 30) g),
  30::bigint, 'T3 thirty attempts from one address, each by a fresh profile, answer not_found');
select is(pg_temp.try_join('a31', '000000'), 'rate_limited',
  'T3 the 31st attempt from the address answers rate_limited');
select is(pg_temp.try_join('a31', tests.room_code()), 'rate_limited',
  'T3 and so does the real code');

-- T4: 29 attempts from one address by 10 profiles, then the 30th is allowed.
select tests.create_player('b' || g) from generate_series(0, 9) g;
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.10"}', true);
select is(
  (select count(*) filter (where pg_temp.try_join('b' || (g % 10), '000000') = 'not_found') from generate_series(1, 29) g),
  29::bigint, 'T4 twenty-nine attempts by ten profiles on one address answer not_found');
select is(pg_temp.try_join('b1', '000000'), 'not_found',
  'T4 the 30th attempt on the address is allowed');

-- T5: another address has its own count.
select tests.create_player('c1');
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.11"}', true);
select is(pg_temp.try_join('c1', '000000'), 'not_found',
  'T5 an attempt from another address is allowed while the first is exhausted');
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.9"}', true);
select is(pg_temp.try_join('c1', '000000'), 'rate_limited',
  'T5 and the first address is still refused');

-- T6: no request headers, only the per-profile limits apply.
select tests.create_player('d' || g) from generate_series(1, 35) g;
select set_config('request.headers', '', true);
select is(
  (select count(*) filter (where pg_temp.try_join('d' || g, '000000') = 'not_found') from generate_series(1, 35) g),
  35::bigint, 'T6 thirty-five profiles with no headers are never refused by address');
select is(internal.request_ip_key(), null, 'T6 no headers gives no address key');
select set_config('request.headers', '{"user-agent": "x"}', true);
select is(internal.request_ip_key(), null, 'T6 headers without an address give no address key');

-- T7: a forged first x-forwarded-for entry does not change the key.
select tests.create_player('e1');
select tests.create_player('e2');
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1, 203.0.113.9"}', true);
select is(pg_temp.try_join('e1', '000000'), 'rate_limited',
  'T7 the key comes from the last x-forwarded-for entry, not the forged first one');
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1"}', true);
select is(pg_temp.try_join('e2', '000000'), 'rate_limited',
  'T7 cf-connecting-ip wins over x-forwarded-for');
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1, 203.0.113.9"}', true);
create temp table k1 as select internal.request_ip_key() as k;
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.77, 203.0.113.9"}', true);
select is(internal.request_ip_key(), (select k from k1), 'T7 changing the forged first entry keeps the key');
-- An unparsable cf-connecting-ip falls back to the last x-forwarded-for entry.
select set_config('request.headers', '{"cf-connecting-ip": "not-an-address", "x-forwarded-for": "198.51.100.1, 203.0.113.9"}', true);
select is(internal.request_ip_key(), (select k from k1), 'T7 an unparsable cf-connecting-ip falls back to the last x-forwarded-for entry');
-- An address given with a netmask is keyed on the host.
select set_config('request.headers', '{"cf-connecting-ip": "203.0.113.9/8"}', true);
select is(internal.request_ip_key(), (select k from k1), 'T7 an IPv4 address with a netmask has the key of the plain address');
-- IPv6 is keyed by its /64.
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:1:2:aaaa::1"}', true);
create temp table k6 as select internal.request_ip_key() as k;
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:1:2:bbbb::9"}', true);
select is(internal.request_ip_key(), (select k from k6), 'T7 two IPv6 addresses in one /64 share a key');
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:1:3::1"}', true);
select isnt(internal.request_ip_key(), (select k from k6), 'T7 another /64 has another key');
select set_config('request.headers', '{"cf-connecting-ip": "2001:db8:1:2:cccc::5/48"}', true);
select is(internal.request_ip_key(), (select k from k6), 'T7 an IPv6 address with a netmask is keyed on its host and /64');

-- T8: the 11th taste check submission in an hour is refused, saves nothing, queues nothing.
select tests.create_catalog(10);
insert into public.calibration_titles (title_id, axis, sort, is_active) values
  (tests.film(1), 'horror', 1, true), (tests.film(2), 'romcom', 2, true);
select tests.create_player('f1');
select set_config('request.headers', '', true);
select tests.authenticate_as('f1');
select is(
  (select count(*) filter (where api.submit_calibration(jsonb_build_array(
     jsonb_build_object('title_id', tests.film(1), 'answer', 'love')))->>'status' = 'ok') from generate_series(1, 10)),
  10::bigint, 'T8 ten taste check submissions are answered ok');
create temp table t8 as select api.submit_calibration(jsonb_build_array(
  jsonb_build_object('title_id', tests.film(2), 'answer', 'love'))) as a;
select tests.clear_authentication();
select is((select a->>'status' from t8), 'rate_limited', 'T8 the 11th submission answers rate_limited');
select is((select count(*) from public.user_titles where profile_id = tests.uid('f1') and title_id = tests.film(2)),
  0::bigint, 'T8 the refused submission saved no row');
select is((select count(*) from tests.queued('taste_refresh') q where q->>'profile_id' = tests.uid('f1')::text),
  10::bigint, 'T8 the refused submission queued no taste_refresh');

-- T9: one export an hour.
select tests.create_player('g1');
select tests.authenticate_as('g1');
create temp table t9 as select api.export_my_data() as first_call, api.export_my_data() as second_call;
select tests.clear_authentication();
select is((select first_call->>'status' from t9), 'ok', 'T9 the first export answers ok next to the data');
select ok((select first_call ? 'profile' from t9), 'T9 and carries the data');
select is((select second_call from t9), jsonb_build_object('status', 'rate_limited'),
  'T9 the second export in the hour answers rate_limited');

-- T10: no key holds a raw address.
select is((select count(*) from public.rate_limits where key ~ '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' or key ~* '2001:db8'),
  0::bigint, 'T10 no rate_limits key contains a raw address');

-- T11: nobody can call the helpers.
select is(
  (select count(*) from (values ('anon'), ('authenticated'), ('app_server')) r(role),
          (values ('internal.rate_limit(text, integer, interval, boolean)'), ('internal.request_ip_key()')) f(sig)
   where has_function_privilege(r.role, f.sig, 'execute')),
  0::bigint, 'T11 neither helper is executable by anon, authenticated or app_server');

-- T12: a peek counts nothing.
select internal.rate_limit('t12:p:x', 2, interval '10 minutes');
select internal.rate_limit('t12:p:x', 2, interval '10 minutes', false);
select internal.rate_limit('t12:p:x', 2, interval '10 minutes', false);
select is((select sum(hits) from public.rate_limits where key = 't12:p:x'), 1::bigint,
  'T12 rate_limit with p_count false leaves the count unchanged');
select internal.rate_limit('t12:p:x', 2, interval '10 minutes');
select ok(not internal.rate_limit('t12:p:x', 2, interval '10 minutes', false),
  'T12 a peek says no when the next hit would be refused');

select * from finish();
rollback;

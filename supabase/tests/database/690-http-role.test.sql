-- M8.4: the HTTP API checks that a token's user has a profile, and nothing more
-- (security.md#the-servers-http-api-and-letterboxd-uploads). app_http reads no
-- table: the one question goes through a definer function that only it can run.

begin;
select plan(9);

select tests.create_player('http-player');

-- B1: true for a player, false for an id nobody has.
select tests.act_as_http();
select is(
  internal.http_profile_exists(tests.uid('http-player')),
  true,
  'B1 http_profile_exists is true for a player'
);
select is(
  internal.http_profile_exists(tests.uid('http-nobody')),
  false,
  'B1 http_profile_exists is false for an id with no profile'
);
select is(
  internal.http_profile_exists(null),
  false,
  'B1 http_profile_exists is false for null'
);

-- B2: app_http still reads no table.
select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501', null,
  'B2 app_http cannot select from profiles'
);
select tests.clear_authentication();
reset role;

-- B3: nobody else can run it.
select ok(
  not has_function_privilege('authenticated', 'internal.http_profile_exists(uuid)', 'execute')
  and not has_function_privilege('anon', 'internal.http_profile_exists(uuid)', 'execute')
  and not has_function_privilege('app_server', 'internal.http_profile_exists(uuid)', 'execute')
  and not has_function_privilege('service_role', 'internal.http_profile_exists(uuid)', 'execute'),
  'B3 authenticated, anon, app_server and service_role cannot execute it'
);
select ok(
  has_function_privilege('app_http', 'internal.http_profile_exists(uuid)', 'execute')
  and has_function_privilege('flimme_http', 'internal.http_profile_exists(uuid)', 'execute'),
  'B3 app_http and its login can execute it'
);

-- B4: a definer function with an empty search path, and it is not exposed through api.
select ok(
  (select p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""']
     from pg_proc p where p.oid = 'internal.http_profile_exists(uuid)'::regprocedure),
  'B4 it is security definer, stable, with an empty search_path'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api' and p.proname = 'http_profile_exists'),
  0,
  'B4 it is not in the api schema'
);

-- B5: a player cannot call it as themselves.
select tests.authenticate_as('http-player');
select throws_ok(
  $$select internal.http_profile_exists(tests.uid('http-player'))$$,
  '42501', null,
  'B5 a player cannot call it'
);

select * from finish();
rollback;

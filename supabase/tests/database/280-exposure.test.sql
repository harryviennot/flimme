-- M1.7: nothing a later migration creates is reachable by phones unless it is
-- granted on purpose, and this file is the check that says so
-- (security.md#the-database-gaps-found, gap 1). Runs on the lite database and
-- on the real stack.
--
-- THE ALLOWLIST LIVES HERE. A later task that opens something to phones on
-- purpose edits pg_temp.exposure() below (the arrays in checks c and e) in the
-- same pull request. Nothing is ever allowed for anon.
--
-- The checks, each listing what breaks the rule (empty means it holds):
--   a  tables in public and rec without row-level security
--   b  functions in api, internal, rec, public that anon can execute
--   c  functions authenticated can execute that are not in api and not one of
--      the five allowlisted internal helpers
--   d  any privilege of anon on a table, view or sequence in those schemas
--   e  any privilege of authenticated beyond select on the 18 baseline tables
--      and the api views (sequences: none at all)
--   f  security definer functions without a pinned search_path
--   g  api views that are not security_invoker

begin;
select plan(23);

create function pg_temp.exposure(p_check text) returns setof text
language sql stable
as $$
  with
  fns as (
    select p.oid, n.nspname, format('%s.%s(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig,
           p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('api', 'internal', 'rec', 'public')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  ),
  rels as (
    select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.reloptions,
           format('%s.%s', n.nspname, c.relname) as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('api', 'internal', 'rec', 'public')
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  )
  select sig from (
    select 'a' as chk, name as sig from rels
      where nspname in ('public', 'rec') and relkind in ('r', 'p') and not relrowsecurity
    union all
    select 'b', sig from fns where has_function_privilege('anon', oid, 'execute')
    union all
    select 'c', sig from fns
      where has_function_privilege('authenticated', oid, 'execute')
        and nspname <> 'api'
        and oid <> all (array[
          'internal.my_profile_id()'::regprocedure,
          'internal.my_profile_ids()'::regprocedure,
          'internal.is_room_member(uuid)'::regprocedure,
          'internal.can_use_room_topic(text, boolean)'::regprocedure,
          'internal.my_seat_ids()'::regprocedure,  -- M1.8: the own_seat policy on votes calls it
          'internal.next_room_code(uuid)'::regprocedure  -- M6.22: api.rooms calls it
        ]::oid[])
    union all
    select 'd', name from rels
      where (relkind = 'S' and has_sequence_privilege('anon', oid, 'usage,select,update'))
         or (relkind <> 'S' and (has_any_column_privilege('anon', oid, 'select,insert,update,references')
                                 or has_table_privilege('anon', oid, 'delete,truncate,trigger')))
    union all
    select 'e', name from rels
      where (relkind = 'S' and has_sequence_privilege('authenticated', oid, 'usage,select,update'))
         or (relkind <> 'S' and (
               has_any_column_privilege('authenticated', oid, 'insert,update,references')
               or has_table_privilege('authenticated', oid, 'delete,truncate,trigger')
               or (has_any_column_privilege('authenticated', oid, 'select')
                   and nspname <> 'api'
                   and name <> all (array[
                     'public.profiles', 'public.profile_providers', 'public.providers', 'public.provider_regions',
                     'public.genres', 'public.moods', 'public.game_modes', 'public.calibration_titles',
                     'public.app_config', 'public.rooms', 'public.room_members', 'public.matches',
                     'public.rounds', 'public.round_candidates', 'public.votes', 'public.linked_accounts',
                     'public.imports', 'public.import_rows'
                   ]))))
    union all
    select 'f', sig from fns
      where prosecdef and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c in ('search_path=""', 'search_path='))
    union all
    select 'g', name from rels
      where nspname = 'api' and relkind = 'v'
        and not exists (select 1 from pg_options_to_table(reloptions) o
                        where o.option_name = 'security_invoker' and o.option_value::boolean)
  ) x
  where chk = p_check
  order by sig
$$;

-- T1: the migrated schema passes every check.
select is(array(select pg_temp.exposure('a')), '{}'::text[], 'T1a every table in public and rec has row-level security');
select is(array(select pg_temp.exposure('b')), '{}'::text[], 'T1b anon can execute no function');
select is(array(select pg_temp.exposure('c')), '{}'::text[], 'T1c authenticated executes only api and the four helpers');
select is(array(select pg_temp.exposure('d')), '{}'::text[], 'T1d anon holds no privilege on any table, view or sequence');
select is(array(select pg_temp.exposure('e')), '{}'::text[], 'T1e authenticated holds select on the baseline tables and api views only');
select is(array(select pg_temp.exposure('f')), '{}'::text[], 'T1f every security definer function pins search_path');
select is(array(select pg_temp.exposure('g')), '{}'::text[], 'T1g every api view is security_invoker');

-- T2: a table without row-level security is listed.
create table public.t2_no_rls (id int);
select is(array(select pg_temp.exposure('a')), array['public.t2_no_rls'], 'T2 check a lists a public table without row-level security');

-- T3: a function created now, in each schema, is executable by nobody.
create function api.t3_f() returns int language sql as $$ select 1 $$;
create function internal.t3_f() returns int language sql as $$ select 1 $$;
create function rec.t3_f() returns int language sql as $$ select 1 $$;
create function public.t3_f() returns int language sql as $$ select 1 $$;
select is(has_function_privilege('anon', 'api.t3_f()', 'execute'), false, 'T3 anon cannot execute a new api function');
select is(has_function_privilege('authenticated', 'api.t3_f()', 'execute'), false, 'T3 authenticated cannot execute a new api function');
select is(has_function_privilege('anon', 'internal.t3_f()', 'execute'), false, 'T3 anon cannot execute a new internal function');
select is(has_function_privilege('authenticated', 'internal.t3_f()', 'execute'), false, 'T3 authenticated cannot execute a new internal function');
select is(has_function_privilege('anon', 'rec.t3_f()', 'execute'), false, 'T3 anon cannot execute a new rec function');
select is(has_function_privilege('authenticated', 'rec.t3_f()', 'execute'), false, 'T3 authenticated cannot execute a new rec function');
select is(has_function_privilege('anon', 'public.t3_f()', 'execute'), false, 'T3 anon cannot execute a new public function');
select is(has_function_privilege('authenticated', 'public.t3_f()', 'execute'), false, 'T3 authenticated cannot execute a new public function');

-- T4: a table and a sequence created now carry no grant for phones.
create table public.t4_table (id int);
create sequence public.t4_seq;
select is(
  has_table_privilege('anon', 'public.t4_table', 'select,insert,update,delete,truncate,references,trigger')
  or has_table_privilege('authenticated', 'public.t4_table', 'select,insert,update,delete,truncate,references,trigger'),
  false, 'T4 anon and authenticated hold no privilege on a new public table');
select is(
  has_sequence_privilege('anon', 'public.t4_seq', 'usage,select,update')
  or has_sequence_privilege('authenticated', 'public.t4_seq', 'usage,select,update'),
  false, 'T4 anon and authenticated hold no privilege on a new public sequence');

-- T5: an internal function opened to authenticated is listed by check c.
grant execute on function internal.t3_f() to authenticated;
select is(array(select pg_temp.exposure('c')), array['internal.t3_f()'], 'T5 check c lists an internal function granted to authenticated');

-- T6: a function opened to anon is listed by check b.
grant execute on function public.t3_f() to anon;
select is(array(select pg_temp.exposure('b')), array['public.t3_f()'], 'T6 check b lists a function granted to anon');

-- T7: a security definer function without search_path and an api view that is
-- not security_invoker are listed.
create function public.t7_definer() returns int language sql security definer as $$ select 1 $$;
create view api.t7_view as select 1 as x;
select is(array(select pg_temp.exposure('f')), array['public.t7_definer()'], 'T7 check f lists a security definer function without search_path');
select is(array(select pg_temp.exposure('g')), array['api.t7_view'], 'T7 check g lists an api view that is not security_invoker');

-- A view that sets the option as "on" is fine: the check reads it as a boolean.
create view api.t7_view_ok with (security_invoker = on) as select 1 as x;
select is(array(select pg_temp.exposure('g')), array['api.t7_view'], 'T7 check g accepts security_invoker = on');

select * from finish();
rollback;

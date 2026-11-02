-- M1.12: one database login per server process, and a narrower role for the
-- internet-facing HTTP API (security.md#the-database-gaps-found, gap 11).
-- Rules: security.md#secrets-and-the-servers-database-logins. Each login can do
-- its process's job and nothing more. Runs on the lite database and on the
-- real stack.

begin;
select plan(42);

-- Roles belong to the cluster; when this runs as a non-superuser it must be
-- allowed to switch to them.
create function pg_temp.may_switch(p_role text) returns void
language plpgsql
as $$
begin
  if not pg_has_role(current_user, p_role, 'SET') then
    execute format('grant %I to %I with inherit false, set true', p_role, current_user);
  end if;
end
$$;

-- T1: each login exists, can log in, sits in the right group, and has none of
-- the four dangerous attributes. No password is set by a migration.
select ok(
  (select count(*) = 4 from pg_roles where rolname in ('flimme_deck', 'flimme_pipeline', 'flimme_trainer', 'flimme_http') and rolcanlogin),
  'T1 the four logins exist and can log in'
);
select ok(
  (select not rolcanlogin from pg_roles where rolname = 'app_http'),
  'T1 app_http is a group role that cannot log in'
);
select is(
  (select count(*)::integer from pg_roles
    where rolname in ('flimme_deck', 'flimme_pipeline', 'flimme_trainer', 'flimme_http', 'app_http')
      and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)),
  0,
  'T1 none of them is superuser, createrole, createdb or bypassrls'
);
select is(
  (select count(*)::integer from pg_roles
    where rolname in ('flimme_deck', 'flimme_pipeline', 'flimme_trainer', 'flimme_http') and not rolinherit),
  0,
  'T1 the logins inherit their group'
);
select is(
  (select count(*)::integer from pg_authid
    where rolname in ('flimme_deck', 'flimme_pipeline', 'flimme_trainer', 'flimme_http') and rolpassword is not null),
  0,
  'T1 no login has a password in the migration'
);
select ok(pg_has_role('flimme_deck', 'app_server', 'MEMBER'), 'T1 flimme_deck is in app_server');
select ok(pg_has_role('flimme_pipeline', 'app_server', 'MEMBER'), 'T1 flimme_pipeline is in app_server');
select ok(pg_has_role('flimme_trainer', 'app_server', 'MEMBER'), 'T1 flimme_trainer is in app_server');
select ok(pg_has_role('flimme_http', 'app_http', 'MEMBER'), 'T1 flimme_http is in app_http');
select ok(not pg_has_role('flimme_http', 'app_server', 'MEMBER'), 'T1 flimme_http is not in app_server');
select ok(not pg_has_role('app_http', 'app_server', 'MEMBER'), 'T1 app_http is not in app_server');

-- T2: the deck worker.
select ok(
  has_function_privilege('flimme_deck', 'internal.deck_candidates(uuid, integer, real)', 'execute')
  and has_function_privilege('flimme_deck', 'internal.deal_cards(uuid, jsonb)', 'execute')
  and has_function_privilege('flimme_deck', 'internal.deal_baseline(uuid, uuid)', 'execute'),
  'T2 flimme_deck executes deck_candidates, deal_cards and deal_baseline'
);
select pg_temp.may_switch('flimme_deck');
set local role flimme_deck;
select lives_ok($$select count(*) from public.titles$$, 'T2 flimme_deck reads public.titles');
select lives_ok($$select count(*) from pgmq.q_deck_requests$$, 'T2 flimme_deck reads pgmq.q_deck_requests');
select throws_ok(
  $$insert into public.rooms (id) values (gen_random_uuid())$$,
  '42501', null,
  'T2 flimme_deck does not write game tables directly'
);
reset role;

-- T3: the pipeline worker.
select ok(
  has_function_privilege('flimme_pipeline', 'internal.finish_letterboxd_import(uuid)', 'execute')
  and has_function_privilege('flimme_pipeline', 'internal.apply_letterboxd_feed(uuid, jsonb, text, text)', 'execute')
  and has_function_privilege('flimme_pipeline', 'internal.broadcast_room(uuid, text, jsonb)', 'execute')
  and has_function_privilege('flimme_pipeline', 'internal.enqueue(text, jsonb)', 'execute'),
  'T3 flimme_pipeline executes finish_letterboxd_import, apply_letterboxd_feed, broadcast_room and enqueue'
);
select ok(
  has_table_privilege('flimme_pipeline', 'public.titles', 'insert')
  and has_table_privilege('flimme_pipeline', 'public.titles', 'update'),
  'T3 flimme_pipeline writes public.titles'
);
select pg_temp.may_switch('flimme_pipeline');
set local role flimme_pipeline;
select lives_ok($$delete from public.titles where false$$, 'T3 flimme_pipeline can delete from public.titles');
reset role;

-- T4: the trainer.
select ok(has_table_privilege('flimme_trainer', 'public.swipe_log', 'select'), 'T4 flimme_trainer reads public.swipe_log');
select ok(
  has_table_privilege('flimme_trainer', 'rec.models', 'insert')
  and has_table_privilege('flimme_trainer', 'rec.models', 'update'),
  'T4 flimme_trainer writes rec.models'
);
select pg_temp.may_switch('flimme_trainer');
set local role flimme_trainer;
select lives_ok($$select count(*) from public.swipe_log$$, 'T4 flimme_trainer selects from swipe_log');
select lives_ok(
  $$insert into rec.models (version, kind) values ('t4-model', 'ranker')$$,
  'T4 flimme_trainer inserts a model'
);
reset role;

-- T5: the HTTP API.
select ok(
  has_function_privilege('flimme_http', 'internal.start_letterboxd_import(uuid, jsonb)', 'execute')
  and has_function_privilege('flimme_http', 'internal.enqueue(text, jsonb)', 'execute'),
  'T5 flimme_http executes start_letterboxd_import and enqueue'
);
select ok(has_schema_privilege('flimme_http', 'internal', 'usage'), 'T5 flimme_http can use schema internal');

-- T6: and nothing else. pgTAP's functions are not reachable by app_http, so each
-- attempt runs in a block that keeps its outcome in a setting, read back after.
select pg_temp.may_switch('flimme_http');
set local role flimme_http;
do $t6$
declare
  v_sql text;
  v_i integer := 0;
begin
  foreach v_sql in array array[
    'select count(*) from public.profiles',
    'select count(*) from public.titles',
    'select count(*) from pgmq.q_deck_requests',
    'select count(*) from pgmq.a_deck_requests',
    'select internal.deal_cards(gen_random_uuid(), ''{}''::jsonb)',
    'select internal.broadcast_room(gen_random_uuid(), ''x'', ''{}''::jsonb)',
    'select count(*) from pgmq.read(''deck_requests'', 30, 5)'
  ] loop
    v_i := v_i + 1;
    begin
      execute v_sql;
      perform set_config('tests.t6_' || v_i, 'allowed', true);
    exception when insufficient_privilege then
      perform set_config('tests.t6_' || v_i, 'denied', true);
    end;
  end loop;
end
$t6$;
reset role;
select is(current_setting('tests.t6_1'), 'denied', 'T6 flimme_http cannot select public.profiles');
select is(current_setting('tests.t6_2'), 'denied', 'T6 flimme_http cannot select public.titles');
select is(current_setting('tests.t6_3'), 'denied', 'T6 flimme_http cannot read a queue table');
select is(current_setting('tests.t6_4'), 'denied', 'T6 flimme_http cannot read an archive table');
select is(current_setting('tests.t6_5'), 'denied', 'T6 flimme_http cannot execute deal_cards');
select is(current_setting('tests.t6_6'), 'denied', 'T6 flimme_http cannot execute broadcast_room');
select is(current_setting('tests.t6_7'), 'denied', 'T6 flimme_http cannot read messages with pgmq.read');

select is(
  (select count(*)::integer
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('api', 'internal', 'rec', 'public')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('app_http', p.oid, 'execute')
      and p.oid::regprocedure::text not in (
        'internal.start_letterboxd_import(uuid,jsonb)', 'internal.enqueue(text,jsonb)')),
  0,
  'T6 app_http executes no other function of ours'
);
select is(
  (select count(*)::integer
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('api', 'internal', 'rec', 'public', 'pgmq')
      and case when c.relkind in ('r', 'p', 'v', 'm', 'f')
               then has_table_privilege('app_http', c.oid, 'select, insert, update, delete, truncate, references, trigger')
               else false end),
  0,
  'T6 app_http has no right on any table or view'
);
select is(
  (select count(*)::integer
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('api', 'internal', 'rec', 'public', 'pgmq')
      and case when c.relkind = 'S' then has_sequence_privilege('app_http', c.oid, 'usage, select, update') else false end),
  0,
  'T6 app_http has no right on any sequence'
);

-- T7: only the HTTP API starts a Letterboxd import (server-structure.md#the-database-layer).
select ok(
  not has_function_privilege('app_server', 'internal.start_letterboxd_import(uuid, jsonb)', 'execute'),
  'T7 app_server can no longer execute start_letterboxd_import'
);
select ok(
  not has_function_privilege('flimme_deck', 'internal.start_letterboxd_import(uuid, jsonb)', 'execute')
  and not has_function_privilege('flimme_pipeline', 'internal.start_letterboxd_import(uuid, jsonb)', 'execute')
  and not has_function_privilege('flimme_trainer', 'internal.start_letterboxd_import(uuid, jsonb)', 'execute'),
  'T7 none of the three worker logins can execute it either'
);
select ok(
  has_function_privilege('app_server', 'internal.enqueue(text, jsonb)', 'execute')
  and has_function_privilege('app_server', 'internal.finish_letterboxd_import(uuid)', 'execute'),
  'T7 control: app_server keeps enqueue and finish_letterboxd_import'
);

-- T8: the documented statement timeouts, set on the logins.
select is(
  (select r.rolconfig from pg_roles r where r.rolname = 'flimme_deck'),
  array['statement_timeout=2s'],
  'T8 flimme_deck has statement_timeout 2s'
);
select is(
  (select r.rolconfig from pg_roles r where r.rolname = 'flimme_pipeline'),
  array['statement_timeout=60s'],
  'T8 flimme_pipeline has statement_timeout 60s'
);
select is(
  (select r.rolconfig from pg_roles r where r.rolname = 'flimme_http'),
  array['statement_timeout=5s'],
  'T8 flimme_http has statement_timeout 5s'
);
select is(
  (select r.rolconfig from pg_roles r where r.rolname = 'flimme_trainer'),
  null,
  'T8 flimme_trainer has no statement_timeout (its batch queries run long)'
);

-- The existing worker role is unchanged.
select ok(
  has_function_privilege('app_server', 'internal.deal_cards(uuid, jsonb)', 'execute')
  and has_table_privilege('app_server', 'public.profiles', 'select'),
  'control: app_server still deals and reads'
);

select * from finish();
rollback;

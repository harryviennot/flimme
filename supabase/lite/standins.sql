-- Stand-ins for the parts of a Supabase project that the schema relies on.
--
-- Used only by the lite database (supabase/lite/README.md): a plain Postgres 16
-- with pgvector, for cloud sessions that cannot pull Supabase's Docker images.
-- On the real stack (`supabase start`) none of this is loaded: the real roles,
-- Auth, Realtime, Queues and Cron exist there already.
--
-- Rule: copy what Supabase does for the things the schema and the tests touch,
-- and nothing more. Where a stand-in is simpler than the real thing, a comment
-- says how. Loaded by load.sh as a superuser, once, into a fresh database.

-- -------------------------------------------------------------------------
-- Roles. They are cluster-wide, so create them only if missing.
-- Supabase: anon, authenticated and service_role are NOLOGIN NOINHERIT, and
-- service_role bypasses row-level security. (app_server is created by
-- schema.sql itself; load.sh drops it between loads.)
-- -------------------------------------------------------------------------

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- -------------------------------------------------------------------------
-- Extensions live in the "extensions" schema, which is on the default
-- search_path of every Supabase database (so pgTAP's functions resolve too).
-- -------------------------------------------------------------------------

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create extension vector with schema extensions;
create extension pg_trgm with schema extensions;
create extension pgcrypto with schema extensions;

do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end
$$;

-- -------------------------------------------------------------------------
-- Supabase's default privileges: what the loading role creates in "public" is
-- reachable by the three API roles until a revoke says otherwise. This is the
-- cloud default (config.toml: auto_expose_new_tables), so schema.sql's
-- revokes get tested for real.
-- -------------------------------------------------------------------------

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- -------------------------------------------------------------------------
-- auth: users and the functions that read the request's JWT.
-- Real: GoTrue owns the schema and fills many more columns (identities,
-- sessions, MFA, SSO). The schema only needs users.id, the signup trigger and
-- auth.uid(). Tests insert users directly (supabase/tests/database/000-helpers.sql).
-- -------------------------------------------------------------------------

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid not null primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  phone text unique default null,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sign_in_at timestamptz,
  is_anonymous boolean not null default false
);

-- As in Supabase: PostgREST puts the verified token's claims in
-- request.jwt.claims (and the old per-claim settings), and these read them.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create function auth.email() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- -------------------------------------------------------------------------
-- realtime: broadcast from the database, and the table whose row-level
-- security decides who may read and send on a topic (Realtime Authorization).
-- Real: realtime.messages is partitioned by day and Realtime delivers the rows
-- over websockets. Here rows just land in the table, so a test can check what
-- the database broadcast; delivery needs the real stack (*.stack.test.sql).
-- -------------------------------------------------------------------------

create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;

create table realtime.messages (
  id uuid not null default gen_random_uuid(),
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  updated_at timestamp not null default now(),
  inserted_at timestamp not null default now(),
  primary key (id, inserted_at)
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated, service_role;

-- The topic Realtime is checking a policy for. A test sets it with
-- set_config('realtime.topic', 'room:...', true) before reading or inserting.
create function realtime.topic() returns text
language sql stable
as $$
  select nullif(current_setting('realtime.topic', true), '')::text
$$;

-- Modelled on the real function: adds an id to the payload, sets the topic,
-- inserts the row, and turns any error into a warning (a failed broadcast
-- never breaks the caller).
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language plpgsql
as $$
declare
  generated_id uuid := gen_random_uuid();
  final_payload jsonb;
begin
  begin
    if payload ? 'id' then
      final_payload := payload;
    else
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    end if;
    execute format('set local realtime.topic to %L', topic);
    insert into realtime.messages (id, payload, event, topic, private, extension)
    values (generated_id, final_payload, event, topic, private, 'broadcast');
  exception when others then
    raise warning 'ErrorSendingBroadcastMessage: %', sqlerrm;
  end;
end
$$;

-- -------------------------------------------------------------------------
-- pgmq: Supabase Queues. Same table layout as the extension (pgmq.q_<name>
-- and pgmq.a_<name>, the archive) and the same function names and arguments,
-- for what the schema and the server use: create, send, read, read_with_poll,
-- delete, archive, set_vt, purge_queue and drop_queue. delete and archive have
-- the single-id and the array overload, as on the real extension. Real: also
-- has pop, metrics, partitioned queues, headers and more; add here only what a
-- test needs.
-- -------------------------------------------------------------------------

create schema pgmq;

create table pgmq.meta (
  queue_name varchar not null unique,
  is_partitioned boolean not null default false,
  is_unlogged boolean not null default false,
  created_at timestamptz not null default now()
);

create type pgmq.message_record as (
  msg_id bigint,
  read_ct integer,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
);

create function pgmq.create(queue_name text) returns void
language plpgsql
as $$
begin
  execute format(
    'create table if not exists pgmq.%I (
       msg_id bigint primary key generated always as identity,
       read_ct integer not null default 0,
       enqueued_at timestamptz not null default now(),
       vt timestamptz not null,
       message jsonb)', 'q_' || queue_name);
  execute format('create index if not exists %I on pgmq.%I (vt asc)', 'q_' || queue_name || '_vt_idx', 'q_' || queue_name);
  execute format(
    'create table if not exists pgmq.%I (
       msg_id bigint primary key,
       read_ct integer not null,
       enqueued_at timestamptz not null,
       archived_at timestamptz not null default now(),
       vt timestamptz not null,
       message jsonb)', 'a_' || queue_name);
  insert into pgmq.meta (queue_name) values (queue_name) on conflict do nothing;
end
$$;

create function pgmq.send(queue_name text, msg jsonb, delay integer default 0) returns setof bigint
language plpgsql
as $$
begin
  return query execute format(
    'insert into pgmq.%I (vt, message) values (clock_timestamp() + %L * interval ''1 second'', %L) returning msg_id',
    'q_' || queue_name, delay, msg);
end
$$;

create function pgmq.read(queue_name text, vt integer, qty integer, conditional jsonb default '{}')
returns setof pgmq.message_record
language plpgsql
as $$
begin
  return query execute format(
    'with cte as (
       select msg_id from pgmq.%1$I
       where vt <= clock_timestamp() and message @> %2$L
       order by msg_id limit %3$L for update skip locked)
     update pgmq.%1$I t
     set vt = clock_timestamp() + %4$L * interval ''1 second'', read_ct = t.read_ct + 1
     from cte where t.msg_id = cte.msg_id
     returning t.msg_id, t.read_ct, t.enqueued_at, t.vt, t.message',
    'q_' || queue_name, conditional, qty, vt);
end
$$;

create function pgmq.read_with_poll(
  queue_name text, vt integer, qty integer,
  max_poll_seconds integer default 5, poll_interval_ms integer default 100,
  conditional jsonb default '{}'
) returns setof pgmq.message_record
language plpgsql
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_found boolean;
  r pgmq.message_record;
begin
  loop
    v_found := false;
    for r in select * from pgmq.read(queue_name, vt, qty, conditional) loop
      v_found := true;
      return next r;
    end loop;
    exit when v_found or clock_timestamp() >= v_started + max_poll_seconds * interval '1 second';
    perform pg_sleep(poll_interval_ms / 1000.0);
  end loop;
end
$$;

create function pgmq.delete(queue_name text, msg_id bigint) returns boolean
language plpgsql
as $$
declare
  n integer;
begin
  execute format('delete from pgmq.%I where msg_id = %L', 'q_' || queue_name, msg_id);
  get diagnostics n = row_count;
  return n > 0;
end
$$;

create function pgmq.delete(queue_name text, msg_ids bigint[]) returns setof bigint
language plpgsql
as $$
begin
  return query execute format('delete from pgmq.%I where msg_id = any(%L) returning msg_id', 'q_' || queue_name, msg_ids);
end
$$;

create function pgmq.archive(queue_name text, msg_id bigint) returns boolean
language plpgsql
as $$
declare
  n integer;
begin
  execute format(
    'with moved as (delete from pgmq.%I where msg_id = %L returning msg_id, read_ct, enqueued_at, vt, message)
     insert into pgmq.%I (msg_id, read_ct, enqueued_at, vt, message)
     select msg_id, read_ct, enqueued_at, vt, message from moved',
    'q_' || queue_name, msg_id, 'a_' || queue_name);
  get diagnostics n = row_count;
  return n > 0;
end
$$;

create function pgmq.archive(queue_name text, msg_ids bigint[]) returns setof bigint
language plpgsql
as $$
begin
  return query execute format(
    'with moved as (delete from pgmq.%I where msg_id = any(%L) returning msg_id, read_ct, enqueued_at, vt, message)
     insert into pgmq.%I (msg_id, read_ct, enqueued_at, vt, message)
     select msg_id, read_ct, enqueued_at, vt, message from moved returning msg_id',
    'q_' || queue_name, msg_ids, 'a_' || queue_name);
end
$$;

create function pgmq.set_vt(queue_name text, msg_id bigint, vt integer) returns setof pgmq.message_record
language plpgsql
as $$
begin
  return query execute format(
    'update pgmq.%I set vt = clock_timestamp() + %L * interval ''1 second'' where msg_id = %L
     returning msg_id, read_ct, enqueued_at, vt, message',
    'q_' || queue_name, vt, msg_id);
end
$$;

create function pgmq.purge_queue(queue_name text) returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from pgmq.%I', 'q_' || queue_name) into n;
  -- Truncate, as the real extension does: it needs the truncate right, which
  -- delete does not give.
  execute format('truncate pgmq.%I', 'q_' || queue_name);
  return n;
end
$$;

create function pgmq.drop_queue(queue_name text) returns boolean
language plpgsql
as $$
begin
  execute format('drop table if exists pgmq.%I', 'q_' || queue_name);
  execute format('drop table if exists pgmq.%I', 'a_' || queue_name);
  delete from pgmq.meta where meta.queue_name = drop_queue.queue_name;
  return true;
end
$$;

-- -------------------------------------------------------------------------
-- cron: pg_cron. Jobs are recorded but never run in the lite database; a test
-- calls the function a job would call. Real: the cron schema lives in the
-- "postgres" database and a background worker runs the jobs.
-- -------------------------------------------------------------------------

create schema cron;

create table cron.job (
  jobid bigint primary key generated always as identity,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text unique
);

create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql
as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid
$$;

create function cron.schedule(schedule text, command text) returns bigint
language sql
as $$
  insert into cron.job (schedule, command) values (schedule, command) returning jobid
$$;

create function cron.unschedule(job_name text) returns boolean
language sql
as $$
  with gone as (delete from cron.job where jobname = job_name returning 1) select exists (select from gone)
$$;

create function cron.unschedule(job_id bigint) returns boolean
language sql
as $$
  with gone as (delete from cron.job where jobid = job_id returning 1) select exists (select from gone)
$$;

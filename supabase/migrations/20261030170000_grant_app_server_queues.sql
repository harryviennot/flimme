-- M1.12a: the server can consume its queues. The baseline left a to-do here:
-- app_server had no right on pgmq at all, so no worker could read a message.
-- It gets what the loop in server-structure.md#consuming-the-queues uses and
-- nothing else. Sending stays through internal.enqueue; create, send,
-- purge_queue and drop_queue are not granted.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant usage on schema pgmq to app_server;

-- The six queues the server consumes. letterboxd_match joins them when its own
-- task creates it. pgmq's functions run with the caller's rights, so the
-- tables need grants too: read hides a message (update), delete and archive
-- remove it (delete), archive writes the archive (insert), and the loop reads
-- both (select). No truncate, so purge_queue stays refused.
grant select, update, delete on
  pgmq.q_deck_requests, pgmq.q_taste_refresh, pgmq.q_letterboxd_sync,
  pgmq.q_catalog_refresh, pgmq.q_embed_titles, pgmq.q_room_finished
to app_server;

grant select, insert on
  pgmq.a_deck_requests, pgmq.a_taste_refresh, pgmq.a_letterboxd_sync,
  pgmq.a_catalog_refresh, pgmq.a_embed_titles, pgmq.a_room_finished
to app_server;

-- Every overload of the five functions the loop calls, whatever the installed
-- pgmq version has: delete and archive take one id or an array, read_with_poll
-- and set_vt differ between versions, and a grant naming a signature that is
-- missing would fail the whole migration.
do $$
declare
  v_fn regprocedure;
  v_names integer;
begin
  -- Fail loudly on a pgmq that lacks one of them, instead of granting less.
  select count(distinct p.proname) into v_names
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'pgmq'
    and p.proname in ('read', 'read_with_poll', 'delete', 'archive', 'set_vt');
  if v_names <> 5 then
    raise exception 'pgmq has % of the 5 functions app_server needs', v_names;
  end if;

  for v_fn in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgmq'
      and p.proname in ('read', 'read_with_poll', 'delete', 'archive', 'set_vt')
  loop
    execute format('grant execute on function %s to app_server', v_fn);
  end loop;
end
$$;

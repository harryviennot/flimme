-- M1.12a: the server can consume its queues, and nothing more. app_server reads,
-- extends, archives and deletes messages on the six queues it consumes; it can't
-- send (sending stays through internal.enqueue), purge, drop or create a queue;
-- phones touch no queue (server-structure.md#consuming-the-queues).
-- Runs on the lite database and on the real stack.

begin;
select plan(22);

-- A: the loop's functions, as app_server, on deck_requests.
select pgmq.send('deck_requests', jsonb_build_object('t', 'a'));
select pgmq.send('deck_requests', jsonb_build_object('t', 'b'));
select pgmq.send('deck_requests', jsonb_build_object('t', 'c'));

select tests.act_as_server();

select is(
  (select count(*)::integer from pgmq.read_with_poll('deck_requests', 30, 2, 1, 100)),
  2,
  'A1 app_server reads messages with read_with_poll'
);

select is(
  (select count(*)::integer from pgmq.q_deck_requests where vt > clock_timestamp() + interval '20 seconds'),
  2,
  'A2 the read hid the two messages it returned'
);

select is(
  (select count(*)::integer from pgmq.read('deck_requests', 30, 5)),
  1,
  'A3 app_server reads messages with read'
);

select lives_ok(
  $$select pgmq.set_vt('deck_requests', (select min(msg_id) from pgmq.q_deck_requests), 120)$$,
  'A4 app_server extends a message''s visibility timeout with set_vt'
);

select ok(
  (select vt > clock_timestamp() + interval '100 seconds'
     from pgmq.q_deck_requests where msg_id = (select min(msg_id) from pgmq.q_deck_requests)),
  'A5 the timeout of that message is now about 120 seconds out'
);

select is(
  pgmq.archive('deck_requests', (select min(msg_id) from pgmq.q_deck_requests)),
  true,
  'A6 app_server archives a message'
);

select is(
  (select count(*)::integer from pgmq.a_deck_requests where message->>'t' = 'a'),
  1,
  'A7 the archived message is in the archive table'
);

select is(
  pgmq.delete('deck_requests', (select max(msg_id) from pgmq.q_deck_requests)),
  true,
  'A8 app_server deletes a message'
);

select is(
  (select count(*)::integer from pgmq.q_deck_requests),
  1,
  'A9 one message is left in the queue'
);

-- All six queues, not only the first: the table rights the loop needs.
select is(
  (select count(*)::integer
     from unnest(array[
       'deck_requests', 'taste_refresh', 'letterboxd_sync',
       'catalog_refresh', 'embed_titles', 'room_finished'
     ]) q
    where has_table_privilege('app_server', format('pgmq.%I', 'q_' || q), 'select')
      and has_table_privilege('app_server', format('pgmq.%I', 'q_' || q), 'update')
      and has_table_privilege('app_server', format('pgmq.%I', 'q_' || q), 'delete')
      and has_table_privilege('app_server', format('pgmq.%I', 'a_' || q), 'select')
      and has_table_privilege('app_server', format('pgmq.%I', 'a_' || q), 'insert')),
  6,
  'A10 app_server has the table rights on the six queues and their archives'
);

-- Control for A10: not more than the loop needs.
select is(
  (select count(*)::integer
     from unnest(array[
       'deck_requests', 'taste_refresh', 'letterboxd_sync',
       'catalog_refresh', 'embed_titles', 'room_finished'
     ]) q
    where has_table_privilege('app_server', format('pgmq.%I', 'q_' || q), 'insert')
       or has_table_privilege('app_server', format('pgmq.%I', 'q_' || q), 'truncate')
       or has_table_privilege('app_server', format('pgmq.%I', 'a_' || q), 'update')
       or has_table_privilege('app_server', format('pgmq.%I', 'a_' || q), 'delete')),
  0,
  'A11 app_server can''t insert into a queue, truncate it, or change its archive'
);

-- B: what app_server may not do.
select throws_ok(
  $$select pgmq.send('deck_requests', '{"t": "x"}'::jsonb)$$,
  '42501', null,
  'B1 app_server can''t send to a queue directly'
);

select throws_ok(
  $$select pgmq.purge_queue('deck_requests')$$,
  '42501', null,
  'B2 app_server can''t purge a queue'
);

select throws_ok(
  $$select pgmq.drop_queue('deck_requests')$$,
  '42501', null,
  'B3 app_server can''t drop a queue'
);

select throws_ok(
  $$select pgmq.create('app_server_made_this')$$,
  '42501', null,
  'B4 app_server can''t create a queue'
);

select tests.clear_authentication();

select is(
  (select count(*)::integer from pgmq.q_deck_requests),
  1,
  'B5 the refused calls left the queue as it was'
);

-- C: phones read no queue.
select tests.create_player('fan');
select tests.authenticate_as('fan');

select throws_ok(
  $$select count(*) from pgmq.q_deck_requests$$,
  '42501', null,
  'C1 a player can''t read a queue table'
);

select throws_ok(
  $$select count(*) from pgmq.a_deck_requests$$,
  '42501', null,
  'C2 a player can''t read an archive table'
);

select throws_ok(
  $$select count(*) from pgmq.read('deck_requests', 30, 5)$$,
  '42501', null,
  'C3 a player can''t read messages with pgmq.read'
);

select throws_ok(
  $$select pgmq.send('deck_requests', '{"t": "x"}'::jsonb)$$,
  '42501', null,
  'C4 a player can''t send to a queue'
);

select tests.clear_authentication();
select tests.authenticate_as_anon();

select throws_ok(
  $$select count(*) from pgmq.q_deck_requests$$,
  '42501', null,
  'C5 an anonymous visitor can''t read a queue table'
);

select throws_ok(
  $$select count(*) from pgmq.read_with_poll('deck_requests', 30, 5, 1, 100)$$,
  '42501', null,
  'C6 an anonymous visitor can''t read messages with read_with_poll'
);

select tests.clear_authentication();

select * from finish();
rollback;

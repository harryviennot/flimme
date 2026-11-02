-- M1.6: what v1 dropped is gone. Streaming Availability is not a v1 source
-- (decisions.md, "TMDB is the only where-to-watch source"), so its table, its
-- provider column and its queue are removed. Runs on the lite database and on
-- the real stack.

begin;
select plan(4);

select hasnt_table('public', 'title_deep_links', 'V1 title_deep_links does not exist');

select hasnt_column('public', 'providers', 'streaming_availability_id', 'V2 providers.streaming_availability_id does not exist');

select is(to_regclass('pgmq.q_winner_links'), null, 'V3 there is no winner_links queue');

-- The control for V3: the six queues v1 keeps are all still there.
select is(
  (select count(*)::integer
     from unnest(array[
       'deck_requests', 'taste_refresh', 'letterboxd_sync',
       'catalog_refresh', 'embed_titles', 'room_finished'
     ]) q
    where to_regclass(format('pgmq.%I', 'q_' || q)) is not null),
  6,
  'V4 the other six queues still exist'
);

select * from finish();
rollback;

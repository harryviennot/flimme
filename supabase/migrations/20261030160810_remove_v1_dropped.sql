-- M1.6: remove what v1 dropped. Streaming Availability is not a v1 source
-- (decisions.md, "TMDB is the only where-to-watch source"): the winner screen
-- shows where to watch from title_availability and title_watch_links.
-- Nothing shipped reads or writes these, and no function references them, so
-- they go now instead of waiting for a later contract release.

-- set local: the timeouts end with this file's transaction instead of applying
-- to every later migration on the same connection.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Reason: nothing shipped uses this table (no app, no server, no function).
-- Its server_all policy and the app_server grant go with it.
-- squawk-ignore ban-drop-table
drop table if exists public.title_deep_links;

-- Reason: nothing shipped reads this column; no function or view names it.
-- squawk-ignore ban-drop-column
alter table public.providers drop column if exists streaming_availability_id;

-- Reason: the job that fed the winner_links queue no longer exists. Dropping
-- the queue drops its table and its archive.
select pgmq.drop_queue('winner_links');

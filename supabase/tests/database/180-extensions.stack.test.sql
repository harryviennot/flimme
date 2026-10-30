-- The extensions the baseline migration sets up (operations.md#supabase-settings).
-- Real stack only: the lite database has no pgmq, pg_cron or pg_graphql, so the
-- lite runner skips this file.

begin;
select plan(5);

select has_extension('vector', 'pgvector is installed');
select has_extension('pg_trgm', 'pg_trgm is installed');
select has_extension('pgmq', 'pgmq (Supabase Queues) is installed');
select has_extension('pg_cron', 'pg_cron (Supabase Cron) is installed');
select hasnt_extension('pg_graphql', 'pg_graphql is dropped, GraphQL is off');

select * from finish();
rollback;

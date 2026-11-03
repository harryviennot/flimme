-- Which of these TMDB ids already wait in a `fetch` message (or are being read: a message is
-- deleted only when its handler is done), so a sweep does not queue them twice.
select distinct e.id
from pgmq.q_catalog_refresh q
cross join lateral (
  select value::integer as id from jsonb_array_elements_text(q.message -> 'tmdb_ids')
) e
where q.message ->> 'kind' = 'fetch' and e.id = any(%s::integer[])

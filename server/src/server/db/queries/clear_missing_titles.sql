-- TMDB's 6-month rule (tmdb.md#keeping-it-fresh, decision Q22): a film still missing 6 months
-- after TMDB stopped returning it loses its TMDB text, images, credits and vector. The bare row
-- stays (id, media_type, tmdb_id, is_active false, tmdb_missing_since), so old votes still
-- point at something. One statement, so a film is cleared whole or not at all. A cleared film
-- has no original_title, which also makes this safe to run twice.
with gone as (
  select id from public.titles
  where media_type = 'movie' and not is_active and original_title is not null
    and tmdb_missing_since < now() - interval '6 months'
),
translations as (delete from public.title_translations where title_id in (select id from gone)),
credits as (delete from public.title_credits where title_id in (select id from gone)),
certifications as (delete from public.title_certifications where title_id in (select id from gone)),
availability as (delete from public.title_availability where title_id in (select id from gone)),
watch_links as (delete from public.title_watch_links where title_id in (select id from gone)),
vectors as (delete from public.title_vectors where title_id in (select id from gone))
update public.titles t
set imdb_id = null, original_title = null, original_language = null, release_date = null,
    runtime_min = null, genre_ids = '{}', keyword_ids = '{}', collection_id = null,
    popularity = 0, vote_average = null, vote_count = 0, quality_score = null,
    poster_path = null, poster_placeholder = null, backdrop_path = null, trailer_key = null,
    is_adult = false, tmdb_changed_at = null
from gone
where t.id = gone.id and not t.is_active

-- One film from a full fetch. Success clears a 404 and reactivates. `poster_placeholder`
-- (M2.8) and `tmdb_changed_at` (the changes job) are not ours here.
insert into public.titles (
  tmdb_id, imdb_id, original_title, original_language, release_date, runtime_min, genre_ids,
  keyword_ids, collection_id, popularity, vote_average, vote_count, quality_score, poster_path,
  backdrop_path, trailer_key, is_adult, refresh_tier, is_active, tmdb_missing_since, refreshed_at
) values (
  %(tmdb_id)s, %(imdb_id)s, %(original_title)s, %(original_language)s, %(release_date)s,
  %(runtime_min)s, %(genre_ids)s::int[], %(keyword_ids)s::int[], %(collection_id)s, %(popularity)s,
  %(vote_average)s, %(vote_count)s, %(quality_score)s, %(poster_path)s, %(backdrop_path)s,
  %(trailer_key)s, %(is_adult)s, %(refresh_tier)s, true, null, now()
)
on conflict (media_type, tmdb_id) do update set
  imdb_id = excluded.imdb_id,
  original_title = excluded.original_title,
  original_language = excluded.original_language,
  release_date = excluded.release_date,
  runtime_min = excluded.runtime_min,
  genre_ids = excluded.genre_ids,
  keyword_ids = excluded.keyword_ids,
  collection_id = excluded.collection_id,
  popularity = excluded.popularity,
  vote_average = excluded.vote_average,
  vote_count = excluded.vote_count,
  quality_score = excluded.quality_score,
  poster_path = excluded.poster_path,
  backdrop_path = excluded.backdrop_path,
  trailer_key = excluded.trailer_key,
  is_adult = excluded.is_adult,
  refresh_tier = excluded.refresh_tier,
  is_active = true,
  tmdb_missing_since = null,
  refreshed_at = now()
-- xmax is 0 on a fresh insert: a new film has no sweep rows to disagree with.
returning id, (xmax = 0) as inserted

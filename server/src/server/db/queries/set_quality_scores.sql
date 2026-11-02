-- (v / (v + m)) * R + (m / (v + m)) * C for the titles with ids in [lo, hi): the same formula
-- as fetch.quality_score, set in chunks so each statement fits the 60 s timeout.
update public.titles
set quality_score = (
  (greatest(vote_count, 0)::float8 / (greatest(vote_count, 0) + %(m)s)) * coalesce(vote_average, %(c)s)
  + (%(m)s::float8 / (greatest(vote_count, 0) + %(m)s)) * %(c)s
)
where id >= %(lo)s and id < %(hi)s

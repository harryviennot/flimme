-- Synthetic seed data (roadmap task M1.14): France, 10 made-up streaming services,
-- French age ratings, 12 invented genres and 500 invented films, each with French
-- and English text, a certification, 2 or 3 offers and one placeholder vector.
--
-- Synthetic only. No TMDB data may ever be committed here: TMDB's terms allow
-- keeping its data for 6 months at most, and a seed file in git is a copy kept
-- forever (docs/architecture/operations.md, "Seed and test data"). Every title,
-- synopsis and id below is invented. Ids stay clear of the test fixtures:
-- services 8001 to 8010 (fixtures use 9001 and up), genres 7001 to 7012, films
-- with tmdb_id 50000001 to 50000500 (fixtures use 1000000 to 17777215).
--
-- The films come from generate_series, with pseudo-random values taken from
-- md5 of the film number, so every load gives the same rows. The vectors are
-- placeholders, not real embeddings: the SQL deal only ranks films that have a
-- vector (internal.deck_candidates joins title_vectors). No moods, taste check
-- films or test profiles: the first release has none, guests sign in anonymously.
--
-- What the spread guarantees (supabase/tests/database/270-seed.test.sql): every
-- quality preset, every age cap (none, 16, 12, 10, 0) and the 105-minute budget
-- finds 40 films or more on the seed services.

-- Pseudo-random whole number from 0 to 268435455, the same for the same inputs.
create function pg_temp.h(i integer, salt text) returns integer
language sql immutable
as $$
  select ('x' || substr(md5(i::text || ':' || salt), 1, 7))::bit(28)::integer
$$;

insert into public.countries (code, default_language, catalog_enabled) values ('FR', 'fr', true);

insert into public.providers (id, name) values
  (8001, 'Lumo'), (8002, 'Orbite'), (8003, 'Kinobay'), (8004, 'Reelwave'), (8005, 'Nuvola'),
  (8006, 'Bobine'), (8007, 'Cinefaro'), (8008, 'Gratuito'), (8009, 'Pubscreen'), (8010, 'Ecranlibre');

insert into public.provider_regions (provider_id, country, display_priority)
select id, 'FR', (id - 8000)::smallint from public.providers where id between 8001 and 8010;

insert into public.certification_ages (country, certification, min_age) values
  ('FR', 'U', 0), ('FR', '10', 10), ('FR', '12', 12), ('FR', '16', 16), ('FR', '18', 18);

insert into public.genres (id, slug, names) values
  (7001, 'laugh',     '{"en": "Laughs", "fr": "Rires"}'),
  (7002, 'tears',     '{"en": "Tears", "fr": "Larmes"}'),
  (7003, 'chase',     '{"en": "Chase", "fr": "Course-poursuite"}'),
  (7004, 'mystery',   '{"en": "Mystery", "fr": "Mystere"}'),
  (7005, 'journey',   '{"en": "Journey", "fr": "Voyage"}'),
  (7006, 'family',    '{"en": "Family", "fr": "Famille"}'),
  (7007, 'stars',     '{"en": "Stars", "fr": "Etoiles"}'),
  (7008, 'chills',    '{"en": "Chills", "fr": "Frissons"}'),
  (7009, 'romance',   '{"en": "Romance", "fr": "Romance"}'),
  (7010, 'true_tale', '{"en": "True tale", "fr": "Histoire vraie"}'),
  (7011, 'animated',  '{"en": "Animated", "fr": "Animation"}'),
  (7012, 'music',     '{"en": "Music", "fr": "Musique"}');

-- One row per film with every invented value, shared by the inserts below.
create temp table seed_films as
with f as (
  select i, pg_temp.h(i, 'class') % 100 as class
  from generate_series(1, 500) as i
),
syl as (
  select array['ka','vel','mor','tan','quen','lis','bro','zar','nu','fel','dro','ami','sor','pil','gan','xe'] as s,
         array['Quiet','Rapid','Last','Strange','Simple','Magic','Tragic','Funny','Odd','Fragile','Proud','Wild'] as adj_en,
         array['calme','rapide','ultime','etrange','simple','magique','tragique','drole','bizarre','fragile','fier','sauvage'] as adj_fr
)
select f.i,
  50000000 + f.i as tmdb_id,
  initcap(syl.s[1 + pg_temp.h(f.i, 'p1') % 16] || syl.s[1 + pg_temp.h(f.i, 'p2') % 16] || syl.s[1 + pg_temp.h(f.i, 'p3') % 16]) as place,
  1 + pg_temp.h(f.i, 'adj') % 12 as adj,
  80 + pg_temp.h(f.i, 'runtime') % 101 as runtime_min,
  make_date(1980 + pg_temp.h(f.i, 'year') % 46, 1 + pg_temp.h(f.i, 'month') % 12, 1 + pg_temp.h(f.i, 'day') % 28) as release_date,
  case when pg_temp.h(f.i, 'lang') % 3 = 0 then 'fr' else 'en' end as original_language,
  1 + pg_temp.h(f.i, 'popularity') % 100 as popularity,
  -- 40% pass every preset, 30% standard and guilty pleasures, 15% guilty
  -- pleasures only, 15% hidden gems only (too few votes for the others).
  -- Scores keep clear of the boundaries (6.2, 7.0, 4.5).
  case when f.class < 40 then 150 + pg_temp.h(f.i, 'votes') % 1851
       when f.class < 70 then 150 + pg_temp.h(f.i, 'votes') % 7851
       when f.class < 85 then 150 + pg_temp.h(f.i, 'votes') % 4851
       else 30 + pg_temp.h(f.i, 'votes') % 120 end as vote_count,
  case when f.class < 40 then 7.1 + (pg_temp.h(f.i, 'score') % 150) / 100.0
       when f.class < 70 then 6.3 + (pg_temp.h(f.i, 'score') % 70) / 100.0
       when f.class < 85 then 4.6 + (pg_temp.h(f.i, 'score') % 160) / 100.0
       else 7.1 + (pg_temp.h(f.i, 'score') % 90) / 100.0 end as score,
  array(select distinct 7001 + pg_temp.h(f.i, 'g' || k) % 12 from generate_series(1, 1 + pg_temp.h(f.i, 'gn') % 3) k) as genre_ids,
  (array['U', '10', '12', '16', '18'])[case
     when pg_temp.h(f.i, 'cert') % 100 < 25 then 1
     when pg_temp.h(f.i, 'cert') % 100 < 40 then 2
     when pg_temp.h(f.i, 'cert') % 100 < 60 then 3
     when pg_temp.h(f.i, 'cert') % 100 < 85 then 4
     else 5 end] as certification,
  8001 + pg_temp.h(f.i, 's1') % 10 as service_1
from f cross join syl;

insert into public.titles
  (media_type, tmdb_id, original_title, original_language, release_date, runtime_min, genre_ids,
   popularity, vote_average, vote_count, quality_score)
select 'movie', s.tmdb_id,
  'The ' || (array['Quiet','Rapid','Last','Strange','Simple','Magic','Tragic','Funny','Odd','Fragile','Proud','Wild'])[s.adj] || ' ' || s.place,
  s.original_language, s.release_date, s.runtime_min, s.genre_ids,
  s.popularity, s.score, s.vote_count, s.score
from seed_films s order by s.i;

insert into public.title_translations (title_id, language, title, overview)
select t.id, l.language,
  case l.language
    when 'en' then 'The ' || (array['Quiet','Rapid','Last','Strange','Simple','Magic','Tragic','Funny','Odd','Fragile','Proud','Wild'])[s.adj] || ' ' || s.place
    else s.place || ' ' || (array['calme','rapide','ultime','etrange','simple','magique','tragique','drole','bizarre','fragile','fier','sauvage'])[s.adj]
  end,
  case l.language
    when 'en' then 'An invented story set in ' || s.place || ', where ' || (2 + s.i % 5) || ' friends find out that a made-up secret is never quite what it seems.'
    else 'Une histoire inventee a ' || s.place || ', ou ' || (2 + s.i % 5) || ' amis decouvrent qu''un secret imaginaire n''est jamais tout a fait ce qu''il semble.'
  end
from seed_films s
join public.titles t on t.media_type = 'movie' and t.tmdb_id = s.tmdb_id
cross join (values ('en'), ('fr')) as l(language);

insert into public.title_certifications (title_id, country, certification, min_age)
select t.id, 'FR', s.certification, a.min_age
from seed_films s
join public.titles t on t.media_type = 'movie' and t.tmdb_id = s.tmdb_id
join public.certification_ages a on a.country = 'FR' and a.certification = s.certification;

-- Every film is on 2 services, 4 in 10 on a third, one in 7 can also be rented.
-- 8008 and 8010 are free, 8009 has ads, the other seven are subscriptions.
insert into public.title_availability (title_id, country, provider_id, kind)
select distinct t.id, 'FR', o.provider_id,
  case o.provider_id when 8008 then 'free' when 8010 then 'free' when 8009 then 'ads' else o.kind end::public.offer_kind
from seed_films s
join public.titles t on t.media_type = 'movie' and t.tmdb_id = s.tmdb_id
cross join lateral (
  select s.service_1 as provider_id, 'subscription' as kind
  union all
  select 8001 + (s.service_1 - 8001 + 1 + pg_temp.h(s.i, 's2') % 9) % 10, 'subscription'
  union all
  select 8001 + (s.service_1 - 8001 + 1 + pg_temp.h(s.i, 's3') % 9) % 10, 'subscription'
    where pg_temp.h(s.i, 's3on') % 10 < 4
  union all
  select 8001 + pg_temp.h(s.i, 'rent') % 7, 'rent' where pg_temp.h(s.i, 'renton') % 7 = 0
) o;

-- Placeholder vectors: 384 values from -1 to 1, one film one vector.
insert into public.title_vectors (title_id, embedding, source_hash)
select t.id,
  ('[' || (select string_agg(round(((pg_temp.h(s.i, 'v' || d) % 2001) - 1000) / 1000.0, 3)::text, ',' order by d)
           from generate_series(1, 384) d) || ']')::extensions.vector,
  md5('seed:' || s.i)
from seed_films s
join public.titles t on t.media_type = 'movie' and t.tmdb_id = s.tmdb_id;

drop table seed_films;

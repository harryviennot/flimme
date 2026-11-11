-- M6.69: api.search_people, the people search for Not tonight
-- (game-modes.md#apisearch_peoplequery). Up to 8 directors and cast of active films, found by
-- part of their name with accents and case ignored, ranked by closeness then popularity, each with
-- one film they're known for. No photo. The query never reaches a log, a key or a notice.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create extension if not exists unaccent with schema extensions;

-- The one place that decides what "the same name" means. Immutable so a trigram index can use it:
-- the two-argument unaccent names its dictionary, which is what makes that safe.
create function internal.search_key(p_text text) returns text
language sql immutable parallel safe set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_text))
$$;
revoke execute on function internal.search_key(text) from public, anon, authenticated;

-- Migrations run in a transaction, which a concurrent build can't; only the ingest writes people.
-- squawk-ignore require-concurrent-index-creation
create index if not exists people_search_key_idx on public.people
  using gin (internal.search_key(name) extensions.gin_trgm_ops);

create function api.search_people(p_query text, p_language text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_profile uuid := internal.my_profile_id();
  v_query text := btrim(p_query, E' \t\r\n');
  v_key text;
  v_like text;
  v_language text;
  v_people jsonb;
begin
  if v_profile is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if v_query is null or char_length(v_query) not between 2 and 60 then
    return jsonb_build_object('status', 'invalid');
  end if;
  -- The key is the profile only, never the query.
  if not internal.rate_limit('people_search:p:' || v_profile, 60, interval '1 minute') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  v_key := internal.search_key(v_query);
  v_like := replace(replace(replace(v_key, '\', '\\'), '%', '\%'), '_', '\_');
  v_language := coalesce(
    nullif(p_language, ''),
    (select p.language from public.profiles p where p.id = v_profile),
    'en');

  select coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', c.name, 'known_for', kf.known_for)
    order by c.sim desc, c.popularity desc nulls last, c.id), '[]'::jsonb)
  into v_people
  from (
    select p.id, p.name, p.popularity,
           extensions.word_similarity(v_key, internal.search_key(p.name)) as sim
    from public.people p
    where (internal.search_key(p.name) like '%' || v_like || '%' escape '\'
           or v_key operator(extensions.<%) internal.search_key(p.name))
      and exists (
        select 1 from public.title_credits tc
        join public.titles t on t.id = tc.title_id
        where tc.person_id = p.id and tc.role in ('director', 'cast')
          and t.media_type = 'movie' and t.is_active and not t.is_adult)
    order by sim desc, p.popularity desc nulls last, p.id
    limit 8
  ) c
  cross join lateral (
    select jsonb_build_object(
      'title', coalesce(tr.title, en.title, t.original_title),
      'year', t.release_year) as known_for
    from public.title_credits tc
    join public.titles t on t.id = tc.title_id
    left join public.title_translations tr on tr.title_id = t.id and tr.language = v_language
    left join public.title_translations en on en.title_id = t.id and en.language = 'en'
    where tc.person_id = c.id and tc.role in ('director', 'cast')
      and t.media_type = 'movie' and t.is_active and not t.is_adult
    order by t.popularity desc, t.id
    limit 1
  ) kf;

  return jsonb_build_object('status', 'ok', 'people', v_people);
end
$$;
revoke execute on function api.search_people(text, text) from public, anon;
grant execute on function api.search_people(text, text) to authenticated;

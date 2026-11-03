-- M5.6: a card renders front and back from one api.my_next_cards call (rule 5, the phone never waits
-- on the network for the next card). New internal.card_payloads(room, titles, language) reads the room's
-- country, services, offer kinds and age cap. Services carry their name and logo (free services are not in
-- api.country_providers), a variant's offer shows as its main service, the card carries the backdrop, and
-- there is no trailer in rooms capped under 13. The old four-argument overload stays for api.title_cards
-- until M5.9. api.my_next_cards keeps its signature and answers.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function internal.card_payloads(p_room_id uuid, p_title_ids bigint[], p_language text)
returns table (title_id bigint, card jsonb)
language sql stable security definer set search_path = ''
as $$
  with room as (
    select r.country, r.provider_ids, r.offer_kinds, r.max_age
    from public.rooms r where r.id = p_room_id
  )
  select t.id, jsonb_build_object(
    'title_id', t.id,
    'tmdb_id', t.tmdb_id,
    'title', coalesce(tr.title, en.title, t.original_title),
    'overview', coalesce(tr.overview, en.overview),
    'year', t.release_year,
    'runtime_min', t.runtime_min,
    'genre_ids', t.genre_ids,
    'tmdb_score', round(t.vote_average::numeric, 1),
    'tmdb_votes', t.vote_count,
    'poster_path', coalesce(tr.poster_path, t.poster_path),
    'poster_placeholder', t.poster_placeholder,
    'backdrop_path', t.backdrop_path,
    'trailer_key', case when r.max_age < 13 then null else t.trailer_key end,
    'directors', (
      select coalesce(jsonb_agg(p.name order by c.ord), '[]')
      from public.title_credits c join public.people p on p.id = c.person_id
      where c.title_id = t.id and c.role = 'director'),
    'cast', (
      select coalesce(jsonb_agg(x.name order by x.ord), '[]')
      from (select p.name, c.ord from public.title_credits c join public.people p on p.id = c.person_id
            where c.title_id = t.id and c.role = 'cast' order by c.ord limit 5) x),
    -- The room's services and their variants, each offer under its main service, once per kind.
    'providers', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'provider_id', s.main_id, 'kind', s.kind, 'name', s.name, 'logo_path', s.logo_path)
             order by s.main_id, s.kind), '[]')
      from (
        select distinct m.id as main_id, a.kind, m.name, m.logo_path
        from public.title_availability a
        join public.providers v on v.id = a.provider_id
        join public.providers m on m.id = coalesce(v.parent_id, v.id)
        where a.title_id = t.id and a.country = r.country
          and a.kind = any (r.offer_kinds)
          and (v.id = any (r.provider_ids) or v.parent_id = any (r.provider_ids))
      ) s),
    'watch_link', (
      select w.tmdb_link from public.title_watch_links w where w.title_id = t.id and w.country = r.country)
  )
  from room r
  cross join public.titles t
  left join public.title_translations tr on tr.title_id = t.id and tr.language = p_language
  left join public.title_translations en on en.title_id = t.id and en.language = 'en'
  where t.id = any (p_title_ids)
$$;

revoke execute on function internal.card_payloads(uuid, bigint[], text) from public, anon, authenticated;
grant execute on function internal.card_payloads(uuid, bigint[], text) to app_server;

-- The seat's next cards: a removed seat gets none. Replaces the 20261102192631 version with the
-- new card_payloads; the signature and the order are unchanged.
create or replace function api.my_next_cards(
  p_room_id uuid,
  p_limit integer default 10,
  p_member_id uuid default null,
  p_language text default null
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with seat as (
    select m.id
    from public.room_members m
    where m.room_id = p_room_id
      and m.removed_at is null
      and m.controlled_by in (select internal.my_profile_ids())
      and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
  ),
  upcoming as (
    select d.title_id, d.sort_key, d.source, c.reason_code, c.reason_params, c.member_ratings
    from seat s
    join public.deck_entries d on d.room_member_id = s.id
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
    order by d.sort_key
    limit least(greatest(p_limit, 1), 30)
  ),
  cards as (
    select cp.title_id, cp.card
    from internal.card_payloads(
      p_room_id,
      (select array_agg(u.title_id) from upcoming u),
      coalesce(p_language, (select p.language from public.profiles p where p.id = internal.my_profile_id()), 'en')) cp
  )
  select coalesce(jsonb_agg(c.card || jsonb_build_object(
           'deck_source', u.source, 'reason_code', u.reason_code,
           'reason_params', u.reason_params, 'member_ratings', u.member_ratings)
         order by u.sort_key), '[]')
  from upcoming u join cards c on c.title_id = u.title_id
$$;

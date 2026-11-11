-- M6.69: api.search_people finds directors and cast of active films by part of their name
-- (game-modes.md#apisearch_peoplequery). Made-up people and credits, as 550 does.

begin;
select plan(50);

select tests.create_player('s1');
select tests.create_player('s2');
select tests.create_player('s3');
select tests.create_player('s4');

-- The full answer as a named player, back to the superuser afterwards.
create function pg_temp.search(p_as text, p_query text, p_language text default null) returns jsonb
language plpgsql
as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_as);
  v := api.search_people(p_query, p_language);
  perform tests.clear_authentication();
  return v;
end
$$;

-- The names found, in order.
create function pg_temp.names(p_query text, p_language text default null) returns text[]
language sql
as $$
  select coalesce(array_agg(p->>'name' order by o), '{}')
  from jsonb_array_elements(pg_temp.search('s1', p_query, p_language)->'people') with ordinality as t(p, o)
$$;

-- A made-up film, active unless said otherwise, and a person credited on it.
create function pg_temp.film(p_name text, p_popularity real default 10,
  p_active boolean default true, p_adult boolean default false, p_media public.media_type default 'movie')
returns bigint
language plpgsql
as $$
declare v_id bigint := tests.create_title(p_name);
begin
  update public.titles set popularity = p_popularity, is_active = p_active, is_adult = p_adult,
    media_type = p_media where id = v_id;
  return v_id;
end
$$;
create function pg_temp.credit(p_person integer, p_name text, p_pop real, p_film bigint,
  p_role public.credit_role default 'cast') returns void
language sql
as $$
  insert into public.people (id, name, popularity) values (p_person, p_name, p_pop) on conflict do nothing;
  insert into public.title_credits (title_id, person_id, role) values (p_film, p_person, p_role)
$$;

select pg_temp.film('Search Film A');
select pg_temp.credit(7001, 'Brad Pitt', 50, tests.title_id('Search Film A'));
select pg_temp.credit(7002, 'Penélope Cruz', 40, tests.title_id('Search Film A'), 'director');
select pg_temp.credit(7003, 'Léos Carax', 30, tests.title_id('Search Film A'), 'director');

-- 1: accents and case
select is(pg_temp.names('brad'), array['Brad Pitt'], '1 "brad" finds Brad Pitt');
select is(pg_temp.names('BRAD'), array['Brad Pitt'], '1 "BRAD" finds Brad Pitt');
select is(pg_temp.names('pitt'), array['Brad Pitt'], '1 "pitt" finds Brad Pitt');
select is(pg_temp.names('brad pitt'), array['Brad Pitt'], '1 "brad pitt" finds Brad Pitt');
select is(pg_temp.names('  Brad  '), array['Brad Pitt'], '1 the query is trimmed');

-- 2: accents either way
select is(pg_temp.names('penelope cruz'), array['Penélope Cruz'], '2 "penelope cruz" finds Penélope Cruz');
select is(pg_temp.names('PÉNÉLOPE'), array['Penélope Cruz'], '2 "PÉNÉLOPE" finds Penélope Cruz');
select is(pg_temp.names('leos carax'), array['Léos Carax'], '2 "leos carax" finds Léos Carax');
select is(internal.search_key('Pénélope ÇA'), 'penelope ca', '2 search_key lowers and drops accents');

-- 3: ranking: closer name first, then more popular, then lower id
select pg_temp.credit(7010, 'Zorgon', 1, tests.title_id('Search Film A'));
select pg_temp.credit(7011, 'Zorgonia Smith', 99, tests.title_id('Search Film A'));
select is(pg_temp.names('zorgon'), array['Zorgon', 'Zorgonia Smith'], '3 a closer name ranks first, even if less popular');
select pg_temp.credit(7012, 'Qux Twin', 5, tests.title_id('Search Film A'));
select pg_temp.credit(7013, 'Qux Twin', 50, tests.title_id('Search Film A'));
select pg_temp.credit(7014, 'Qux Twin', 50, tests.title_id('Search Film A'));
select pg_temp.credit(7015, 'Qux Twin', null, tests.title_id('Search Film A'));
select is(
  (select array_agg((p->>'id')::integer order by o)
   from jsonb_array_elements(pg_temp.search('s1', 'qux twin')->'people') with ordinality as t(p, o)),
  array[7013, 7014, 7012, 7015],
  '3 at equal closeness the more popular first (null last), then the lower id');

-- 4: the cap of 8
select pg_temp.credit(7100 + n, 'Mass Person ' || n, n, tests.title_id('Search Film A')) from generate_series(1, 12) n;
select is(jsonb_array_length(pg_temp.search('s1', 'mass person')->'people'), 8, '4 twelve matches: eight come back');

-- 5: only directors and cast of active films
select pg_temp.credit(7200, 'Xyz Onlyperson Writer', 10, tests.title_id('Search Film A'), 'writer');
select pg_temp.credit(7201, 'Xyz Onlyperson Inactive', 10, pg_temp.film('Search Inactive', 10, false));
select pg_temp.credit(7202, 'Xyz Onlyperson Adult', 10, pg_temp.film('Search Adult', 10, true, true));
select pg_temp.credit(7203, 'Xyz Onlyperson Series', 10, pg_temp.film('Search Series', 10, true, false, 'tv'));
select is(pg_temp.names('onlyperson'), '{}'::text[], '5 a writer, and people only in an inactive, adult or TV title, are never found');
select pg_temp.credit(7204, 'Xyz Onlyperson Cast', 10, tests.title_id('Search Film A'));
select pg_temp.credit(7205, 'Xyz Onlyperson Director', 9, tests.title_id('Search Film A'), 'director');
select is(pg_temp.names('onlyperson'), array['Xyz Onlyperson Cast', 'Xyz Onlyperson Director'],
  '5 cast and directors of an active movie are found');

-- 6: known_for is the most popular active film, in the right language
select pg_temp.film('Kf Top', 500);
update public.titles set release_date = date '1999-05-05' where id = tests.title_id('Kf Top');
insert into public.title_translations (title_id, language, title) values
  (tests.title_id('Kf Top'), 'fr', 'Le Meilleur'), (tests.title_id('Kf Top'), 'en', 'The Best');
select pg_temp.film('Kf Lesser', 100);
select pg_temp.film('Kf Inactive Star', 900, false);
select pg_temp.credit(7300, 'Kfperson One', 10, tests.title_id('Kf Lesser'));
select pg_temp.credit(7300, 'Kfperson One', 10, tests.title_id('Kf Inactive Star'));
select pg_temp.credit(7300, 'Kfperson One', 10, tests.title_id('Kf Top'), 'director');
select is(pg_temp.search('s1', 'kfperson', 'fr')->'people'->0->'known_for', '{"title": "Le Meilleur", "year": 1999}'::jsonb,
  '6 known_for is the most popular active film, in French for fr');
select is(pg_temp.search('s1', 'kfperson', 'en')->'people'->0->'known_for', '{"title": "The Best", "year": 1999}'::jsonb,
  '6 and in English for en');
select pg_temp.film('Kf English Only', 80);
insert into public.title_translations (title_id, language, title) values (tests.title_id('Kf English Only'), 'en', 'English Only');
select pg_temp.credit(7301, 'Kfperson Two', 10, tests.title_id('Kf English Only'));
select is(pg_temp.search('s1', 'kfperson two', 'fr')->'people'->0->'known_for'->>'title', 'English Only',
  '6 English when French is missing');
select pg_temp.film('Kf No Translation', 70);
update public.titles set release_date = null where id = tests.title_id('Kf No Translation');
select pg_temp.credit(7302, 'Kfperson Three', 10, tests.title_id('Kf No Translation'));
select is(pg_temp.search('s1', 'kfperson three', 'fr')->'people'->0->'known_for', '{"title": "Kf No Translation", "year": null}'::jsonb,
  '6 the original title when there is no translation, year null when the date is unknown');
update public.profiles set language = 'fr' where id = tests.uid('s2');
select is(pg_temp.search('s2', 'kfperson one')->'people'->0->'known_for'->>'title', 'Le Meilleur',
  '6 with no language given, the profile language is used');
select is(pg_temp.search('s1', 'kfperson one')->'people'->0->'known_for'->>'title', 'The Best',
  '6 with no language and an English profile, English');
select pg_temp.credit(7303, 'Inactiveonly Person', 10, tests.title_id('Kf Inactive Star'));
select is(pg_temp.names('inactiveonly'), '{}'::text[], '6 a person whose only film is inactive is not found');

-- 7: no photo, nothing else
select pg_temp.credit(7304, 'Photo Person', 10, tests.title_id('Kf Top'));
update public.people set profile_path = '/photo.jpg' where id = 7304;
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.search('s1', 'photo person')->'people'->0) k),
  array['id', 'known_for', 'name'], '7 a person has exactly id, name and known_for');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.search('s1', 'photo person')->'people'->0->'known_for') k),
  array['title', 'year'], '7 known_for has exactly title and year');
select is(pg_temp.search('s1', 'photo person')->>'status', 'ok', '7 the answer is ok');
select ok(pg_temp.search('s1', 'photo person')::text !~ 'photo\.jpg|profile_path', '7 no photo anywhere in the answer');

-- 8: query limits
select is(pg_temp.search('s1', 'a')->>'status', 'invalid', '8 one character is invalid');
select is(pg_temp.search('s1', '  a  ')->>'status', 'invalid', '8 one character once trimmed is invalid');
select is(pg_temp.search('s1', '    ')->>'status', 'invalid', '8 only spaces is invalid');
select is(pg_temp.search('s1', repeat('b', 61))->>'status', 'invalid', '8 61 characters is invalid');
select is(pg_temp.search('s1', null)->>'status', 'invalid', '8 null is invalid');
select is(pg_temp.search('s1', 'ab')->>'status', 'ok', '8 2 characters is ok');
select is(pg_temp.search('s1', repeat('b', 60))->>'status', 'ok', '8 60 characters is ok');
select is(jsonb_array_length(pg_temp.search('s1', 'qqqq')->'people'), 0, '8 a query with no match is ok with no people');

-- 9: wildcards are literal
select pg_temp.credit(7400, 'Dbl%%Sign', 10, tests.title_id('Search Film A'));
select pg_temp.credit(7401, 'Und__er', 10, tests.title_id('Search Film A'));
select pg_temp.credit(7402, 'Back\\slash', 10, tests.title_id('Search Film A'));
select pg_temp.credit(7403, 'Plain Name', 10, tests.title_id('Search Film A'));
select is(pg_temp.names('%%'), array['Dbl%%Sign'], '9 "%%" matches literally');
select is(pg_temp.names('__'), array['Und__er'], '9 "__" matches literally');
select is(pg_temp.names('\\'), array['Back\\slash'], '9 two backslashes match literally');

-- 10: the 61st call in a minute is rate limited, and the key holds no query text
select is(
  (select count(*) filter (where pg_temp.search('s3', 'brad')->>'status' = 'ok') from generate_series(1, 60)),
  60::bigint, '10 sixty calls in a minute are answered');
select is(pg_temp.search('s3', 'brad')->>'status', 'rate_limited', '10 the 61st call answers rate_limited');
select is(pg_temp.search('s3', 'a')->>'status', 'invalid', '10 an invalid query is answered before the limit');
select ok(exists (select 1 from public.rate_limits where key = 'people_search:p:' || tests.uid('s3')::text),
  '10 the key is the profile');
select ok(not exists (select 1 from public.rate_limits
  where key like 'people_search:%' and key !~ '^people_search:p:[0-9a-f-]{36}$'), '10 every key is a profile id and nothing else');
select ok(not exists (select 1 from public.rate_limits where key ilike '%brad%'), '10 the key holds no query text');
select is(pg_temp.search('s4', 'brad')->>'status', 'ok', '10 another profile is not limited');

-- 11: access
select ok(not has_function_privilege('anon', 'api.search_people(text, text)', 'execute'), '11 anon cannot execute it');
select ok(has_function_privilege('authenticated', 'api.search_people(text, text)', 'execute'), '11 authenticated can');
select ok(not has_function_privilege('authenticated', 'internal.search_key(text)', 'execute'), '11 the key function is not open to phones');
select ok(not has_table_privilege('authenticated', 'public.people', 'select'), '11 phones still cannot read people');

-- 12: the ingest keeps writing people (the index calls search_key as the writing role)
select tests.act_as_server();
select lives_ok($q$insert into public.people (id, name, popularity) values (7500, 'Ingest Person', 1)
  on conflict (id) do update set name = excluded.name$q$, '12 the server role can insert a person');
select lives_ok($q$update public.people set name = 'Ingest Renamed' where id = 7500$q$, '12 and update one');
select tests.clear_authentication();
select is(pg_temp.search('s2', 'kfperson one', '')->'people'->0->'known_for'->>'title', 'Le Meilleur',
  '6 an empty language falls back to the profile language');

select * from finish();
rollback;

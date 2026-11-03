-- M5.1: internal.deck_candidates for the first release. Services (and their
-- variants and the free ones), age cap, time budget, quality floor, seen films,
-- the crowd score, and the catalog's reality: films with no vector are dealt.
-- Made-up films only. The room is read as the superuser; the server's and the
-- phones' rights are checked at the end.

begin;
select plan(48);

select tests.create_room(3);
select tests.create_provider(9001, 'Main Service');
select tests.create_provider(9002, 'Main Service Basic');
select tests.create_provider(9003, 'Other Service');
select tests.create_provider(9004, 'Other Service Basic');
select tests.create_provider(9005, 'Free Service');
update public.providers set parent_id = 9001 where id = 9002;
update public.providers set parent_id = 9003 where id = 9004;
update public.provider_regions set free_for_all = true where provider_id = 9005 and country = 'FR';
select tests.create_provider(9006, 'Belgian Service', 'BE');
select tests.create_provider(9007, 'Ranking Service');

-- The room has service 9001 only. A made-up film has 1,000 votes, quality 7.0 and
-- 100 minutes (tests.create_title); pg_temp.film adds a poster and one offer.
update public.rooms set provider_ids = '{9001}' where id = tests.room_id();

create function pg_temp.film(
  p_name text,
  p_provider integer default 9001,
  p_kind public.offer_kind default 'subscription',
  p_country char(2) default 'FR'
) returns bigint
language plpgsql
as $$
declare v_id bigint := tests.create_title(p_name);
begin
  update public.titles set poster_path = '/t.jpg' where id = v_id;
  insert into public.title_availability (title_id, country, provider_id, kind)
  values (v_id, p_country, p_provider, p_kind);
  return v_id;
end
$$;

create function pg_temp.cert(p_title bigint, p_min_age integer, p_inferred char(2) default null) returns void
language sql
as $$
  insert into public.title_certifications (title_id, country, certification, min_age, inferred_from)
  values (p_title, 'FR', coalesce('c' || p_min_age, 'unknown'), p_min_age, p_inferred)
$$;

create function pg_temp.dealt(p_title bigint) returns boolean
language sql
as $$
  select exists (select 1 from internal.deck_candidates(tests.room_id(), 1000, 0) c where c.title_id = p_title)
$$;

create function pg_temp.q(p_name text, p_votes integer, p_score real) returns bigint
language plpgsql
as $$
declare v_id bigint := pg_temp.film(p_name);
begin
  update public.titles set vote_count = p_votes, quality_score = p_score where id = v_id;
  return v_id;
end
$$;

-- 1: services
select pg_temp.film('S1 off service', 9003);
select pg_temp.film('S1 on service');
select ok(not pg_temp.dealt(tests.title_id('S1 off service')), 'S1 a film on no room service is not a candidate');
select ok(pg_temp.dealt(tests.title_id('S1 on service')), 'S1 a film on a room service is a candidate');

-- 2: variants
select pg_temp.film('S2 variant', 9002);
select pg_temp.film('S2 other variant', 9004);
select ok(pg_temp.dealt(tests.title_id('S2 variant')), 'S2 a film only on a variant of a room service is a candidate');
select ok(not pg_temp.dealt(tests.title_id('S2 other variant')), 'S2 a variant of a service nobody has is not a candidate');

-- 3: free services, through refresh_room_providers
select pg_temp.film('S3 free', 9005, 'free');
select internal.refresh_room_providers(tests.room_id());
select ok(pg_temp.dealt(tests.title_id('S3 free')), 'S3 a film only on the country''s free service is a candidate');
update public.rooms set include_free_services = false where id = tests.room_id();
select internal.refresh_room_providers(tests.room_id());
select ok(not pg_temp.dealt(tests.title_id('S3 free')), 'S3 with free services off it is not a candidate');
update public.rooms set provider_ids = '{9001}' where id = tests.room_id();

-- 4: offer kind and country
select pg_temp.film('S4 rent', 9001, 'rent');
select pg_temp.film('S4 abroad', 9006, 'subscription', 'BE');
select ok(not pg_temp.dealt(tests.title_id('S4 rent')), 'S4 an offer whose kind is not in offer_kinds does not count');
select ok(not pg_temp.dealt(tests.title_id('S4 abroad')), 'S4 an offer in another country does not count');

-- 5: age cap
select pg_temp.cert(pg_temp.film('S5 age 12'), 12);
select pg_temp.cert(pg_temp.film('S5 age 16'), 16);
select pg_temp.film('S5 no cert');
select pg_temp.cert(pg_temp.film('S5 null age'), null);
select pg_temp.cert(pg_temp.film('S5 inferred 12'), 12, 'US');
select ok(
  pg_temp.dealt(tests.title_id('S5 age 12')) and pg_temp.dealt(tests.title_id('S5 age 16'))
  and pg_temp.dealt(tests.title_id('S5 no cert')) and pg_temp.dealt(tests.title_id('S5 null age'))
  and pg_temp.dealt(tests.title_id('S5 inferred 12')),
  'S5 with no cap, films of every certification are candidates');
update public.rooms set max_age = 12 where id = tests.room_id();
select ok(pg_temp.dealt(tests.title_id('S5 age 12')), 'S5 a cap of 12 keeps a film aged 12');
select ok(not pg_temp.dealt(tests.title_id('S5 age 16')), 'S5 a cap of 12 drops a film aged 16');
select ok(not pg_temp.dealt(tests.title_id('S5 no cert')), 'S5 a cap of 12 drops a film with no certification');
select ok(not pg_temp.dealt(tests.title_id('S5 null age')), 'S5 a cap of 12 drops a certification with no age');
select ok(pg_temp.dealt(tests.title_id('S5 inferred 12')), 'S5 a certification inferred from the US counts like any other');
update public.rooms set max_age = null where id = tests.room_id();

-- 6: time budget
select pg_temp.film('S6 at budget');
update public.titles set runtime_min = 105 where id = tests.title_id('S6 at budget');
select pg_temp.film('S6 over budget');
update public.titles set runtime_min = 106 where id = tests.title_id('S6 over budget');
update public.rooms set runtime_max = 105 where id = tests.room_id();
select ok(pg_temp.dealt(tests.title_id('S6 at budget')), 'S6 a 105 minute film fits a 105 minute budget');
select ok(not pg_temp.dealt(tests.title_id('S6 over budget')), 'S6 a 106 minute film does not');
update public.rooms set runtime_max = null where id = tests.room_id();
select ok(pg_temp.dealt(tests.title_id('S6 over budget')), 'S6 with no budget the 106 minute film is a candidate');

-- 7: quality floors
select pg_temp.q('S7 v149', 149, 7.0);
select pg_temp.q('S7 v150', 150, 7.0);
select pg_temp.q('S7 s61', 1000, 6.1);
select pg_temp.q('S7 s62', 1000, 6.2);
select pg_temp.q('S7 snull', 1000, null);
select ok(not pg_temp.dealt(tests.title_id('S7 v149')), 'S7 standard: 149 votes is out');
select ok(pg_temp.dealt(tests.title_id('S7 v150')), 'S7 standard: 150 votes is in');
select ok(not pg_temp.dealt(tests.title_id('S7 s61')), 'S7 standard: quality 6.1 is out');
select ok(pg_temp.dealt(tests.title_id('S7 s62')), 'S7 standard: quality 6.2 is in');
select ok(not pg_temp.dealt(tests.title_id('S7 snull')), 'S7 standard: no quality score is out');
select pg_temp.q('S7 g29', 29, 7.5);
select pg_temp.q('S7 g30', 30, 7.5);
select pg_temp.q('S7 g2000', 2000, 7.5);
select pg_temp.q('S7 g2001', 2001, 7.5);
select pg_temp.q('S7 g69', 500, 6.9);
update public.rooms set quality = 'hidden_gems' where id = tests.room_id();
select ok(
  pg_temp.dealt(tests.title_id('S7 g30')) and pg_temp.dealt(tests.title_id('S7 g2000'))
  and not pg_temp.dealt(tests.title_id('S7 g29')) and not pg_temp.dealt(tests.title_id('S7 g2001'))
  and not pg_temp.dealt(tests.title_id('S7 g69')),
  'S7 hidden gems: 30 to 2,000 votes and quality 7.0 or more');
select pg_temp.q('S7 p44', 500, 4.4);
select pg_temp.q('S7 p45', 500, 4.5);
update public.rooms set quality = 'guilty_pleasures' where id = tests.room_id();
select ok(
  pg_temp.dealt(tests.title_id('S7 p45')) and not pg_temp.dealt(tests.title_id('S7 p44'))
  and not pg_temp.dealt(tests.title_id('S7 v149')),
  'S7 guilty pleasures: 150 votes and quality 4.5 or more');
update public.rooms set quality = 'standard' where id = tests.room_id();

-- 8: seen films, from seated seats, whatever the source
select pg_temp.film('S8 seen');
select pg_temp.film('S8 left');
insert into public.user_titles (profile_id, title_id, source, seen, rating)
values (tests.uid('p2'), tests.title_id('S8 seen'), 'app', true, 3.5),
       (tests.uid('p3'), tests.title_id('S8 left'), 'calibration', true, null);
update public.room_members set left_at = now() where id = tests.member_id('p3');
select ok(not pg_temp.dealt(tests.title_id('S8 seen')), 'S8 hide_seen: a film a seated player has seen is out');
select ok(pg_temp.dealt(tests.title_id('S8 left')), 'S8 a seat that left does not count');
update public.rooms set seen_rule = 'allow_rewatch' where id = tests.room_id();
select ok(not pg_temp.dealt(tests.title_id('S8 seen')), 'S8 allow_rewatch: out with a rating of 3.5');
update public.user_titles set rating = 4 where title_id = tests.title_id('S8 seen');
select ok(pg_temp.dealt(tests.title_id('S8 seen')), 'S8 allow_rewatch: in when every viewer rated 4 or more');
insert into public.user_titles (profile_id, title_id, source, seen, rating)
values (tests.uid('p1'), tests.title_id('S8 seen'), 'calibration', true, null);
select ok(not pg_temp.dealt(tests.title_id('S8 seen')), 'S8 allow_rewatch: out when one viewer gave no rating');
update public.rooms set seen_rule = 'show_all' where id = tests.room_id();
select ok(pg_temp.dealt(tests.title_id('S8 seen')), 'S8 show_all keeps seen films');
update public.rooms set seen_rule = 'hide_seen' where id = tests.room_id();

-- 9: what never qualifies
select pg_temp.film('S9 inactive');
update public.titles set is_active = false where id = tests.title_id('S9 inactive');
select pg_temp.film('S9 adult');
update public.titles set is_adult = true where id = tests.title_id('S9 adult');
select pg_temp.film('S9 tv');
update public.titles set media_type = 'tv' where id = tests.title_id('S9 tv');
select pg_temp.film('S9 pooled');
insert into public.room_cards (room_id, title_id, group_score, min_fit)
values (tests.room_id(), tests.title_id('S9 pooled'), 3, 3);
select ok(not pg_temp.dealt(tests.title_id('S9 inactive')), 'S9 an inactive film is not a candidate');
select ok(not pg_temp.dealt(tests.title_id('S9 adult')), 'S9 an adult film is not a candidate');
select ok(not pg_temp.dealt(tests.title_id('S9 tv')), 'S9 a tv title is not a candidate');
select ok(not pg_temp.dealt(tests.title_id('S9 pooled')), 'S9 a film already in the pool is not a candidate');

-- 10: no vector (the real catalog has none)
select ok(not exists (select 1 from public.title_vectors v where v.title_id = tests.title_id('S1 on service')),
  'S10 the film has no vector');
select ok(pg_temp.dealt(tests.title_id('S1 on service')), 'S10 a film with no vector is a candidate');

-- 11: poster
select pg_temp.film('S11 no poster');
update public.titles set poster_path = null where id = tests.title_id('S11 no poster');
select ok(not pg_temp.dealt(tests.title_id('S11 no poster')), 'S11 a film with no poster is not a candidate');

-- From here on only 5 films are eligible: the room moves to service 9007.
update public.rooms set provider_ids = '{9007}' where id = tests.room_id();
create function pg_temp.ranked(p_name text, p_quality real, p_popularity real) returns bigint
language plpgsql
as $$
declare v_id bigint := pg_temp.film(p_name, 9007);
begin
  update public.titles set quality_score = p_quality, popularity = p_popularity where id = v_id;
  return v_id;
end
$$;
select pg_temp.ranked('S12 a', 8.0, 50);   -- best quality, middling popularity
select pg_temp.ranked('S12 b', 7.0, 50);   -- same popularity as a, worse quality
select pg_temp.ranked('S12 c', 7.0, 90);   -- same quality as b, more popular
select pg_temp.ranked('S12 d', 6.5, 10);
select pg_temp.ranked('S12 e', 6.3, 20);

-- 12: the crowd score
select is(
  (select array_agg(t.original_title order by c.group_score desc, c.title_id)
   from internal.deck_candidates(tests.room_id(), 1000, 0) c join public.titles t on t.id = c.title_id),
  array['S12 a', 'S12 c', 'S12 b', 'S12 d', 'S12 e']::text[],
  'S12 equal popularity: the better quality first; equal quality: the more popular first'
);
select is(
  (select count(*) from internal.deck_candidates(tests.room_id(), 1000, 0) c
   join public.titles t on t.id = c.title_id
   where abs(c.crowd - (
     0.85 * (select count(*) from public.titles q where q.original_title like 'S12 %' and q.quality_score < t.quality_score) / 4.0
     + 0.15 * (select count(*) from public.titles q where q.original_title like 'S12 %' and q.popularity < t.popularity) / 4.0)) < 0.0001),
  5::bigint,
  'S12 crowd is 0.85 x the quality percentile + 0.15 x the popularity percentile'
);

-- 13: fits (p3 left in S8, so first 2 seats, then 3)
select is(
  (select count(*) from internal.deck_candidates(tests.room_id(), 1000, 0) c
   where (select count(*) from jsonb_object_keys(c.fits)) = 2),
  5::bigint,
  'S13 a seat that left has no fit'
);
update public.room_members set left_at = null where id = tests.member_id('p3');
select is(
  (select count(*) from internal.deck_candidates(tests.room_id(), 1000, 0) c
   where (select count(*) from jsonb_object_keys(c.fits)) = 3
     and (select bool_and(abs(v.value::numeric - round((5 * c.crowd)::numeric, 2)) < 0.011) from jsonb_each_text(c.fits) v)
     and abs(c.group_score - 5 * c.crowd) < 0.0001 and c.min_fit = c.group_score),
  5::bigint,
  'S13 with 3 seats each fit is 5 x crowd, and group_score = min_fit = 5 x crowd'
);

-- 14: misery line
select is((select count(*) from internal.deck_candidates(tests.room_id(), 1000, 1.0) c where c.crowd < 0.2), 0::bigint,
  'S14 with a misery line of 1.0 no candidate has a crowd under 0.2');
select cmp_ok((select count(*) from internal.deck_candidates(tests.room_id(), 1000, 0) c where c.crowd < 0.2), '>=', 1::bigint,
  'S14 with no misery line the bottom films come back');

-- 15: limit and collection
update public.titles set collection_id = 4242 where id = tests.title_id('S12 a');
select is(
  (select array_agg(c.title_id order by c.group_score desc, c.title_id)
   from internal.deck_candidates(tests.room_id(), 3, 0) c),
  (select array_agg(x.title_id order by x.group_score desc, x.title_id) from (
     select y.title_id, y.group_score from internal.deck_candidates(tests.room_id(), 1000, 0) y
     order by y.group_score desc, y.title_id limit 3) x),
  'S15 a limit of 3 returns the 3 best'
);
select is((select count(*) from internal.deck_candidates(tests.room_id(), 3, 0)), 3::bigint, 'S15 a limit of 3 returns 3 rows');
select is((select c.collection_id from internal.deck_candidates(tests.room_id(), 1000, 0) c where c.title_id = tests.title_id('S12 a')),
  4242, 'S15 collection_id is the film''s');

-- 16: rights
select tests.authenticate_as('p1');
select throws_ok($$select * from internal.deck_candidates(tests.room_id())$$, '42501', null, 'S16 a phone cannot execute deck_candidates');
select tests.clear_authentication();
select tests.act_as_server();
select cmp_ok((select count(*) from internal.deck_candidates(tests.room_id(), 1000, 0)), '>=', 5::bigint, 'S16 the server can execute it');
select tests.clear_authentication();

select * from finish();
rollback;

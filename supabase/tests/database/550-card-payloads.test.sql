-- M5.6: api.my_next_cards builds a card that renders front and back from one call, with tonight's
-- services named (data-model.md#the-apps-api, tmdb.md#services-variants-and-channels, Q6.2 to Q6.4).

begin;
select plan(25);

select tests.create_catalog(40);
select tests.deal_game(2);

-- p1's deck grows to 40 cards (films 26 to 40 appended), so the 30-card clamp can be seen.
insert into public.room_cards (room_id, title_id, source, group_score)
select tests.room_id(), tests.film(n), 'ranked', 3 from generate_series(26, 40) n;
insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source)
select tests.room_id(), tests.member_id('p1'), tests.film(n), 100000 + n, 'ranked' from generate_series(26, 40) n;

-- Services: A (9001, from the catalog), B (9002, nobody has it), V (9003, A's variant),
-- F (9004, a free service nobody picked, with a logo).
select tests.create_provider(9002, 'Test Service B');
select tests.create_provider(9003, 'Test Service V');
select tests.create_provider(9004, 'Test Free Service');
update public.providers set parent_id = 9001 where id = 9003;
update public.providers set logo_path = '/free-logo.png' where id = 9004;
update public.rooms set provider_ids = '{9001,9004}', offer_kinds = '{subscription,free,ads}', max_age = null
where id = tests.room_id();

-- Replaces a film's offers with "provider:kind,provider:kind".
create function pg_temp.offers(p_film integer, p_offers text) returns void
language plpgsql as $$
begin
  delete from public.title_availability where title_id = tests.film(p_film);
  insert into public.title_availability (title_id, country, provider_id, kind)
  select tests.film(p_film), 'FR', split_part(x, ':', 1)::integer, split_part(x, ':', 2)::public.offer_kind
  from unnest(string_to_array(p_offers, ',')) x;
end $$;

select pg_temp.offers(1, '9001:subscription,9002:subscription');
select pg_temp.offers(2, '9003:ads');
select pg_temp.offers(3, '9001:subscription,9003:ads');
select pg_temp.offers(4, '9004:free');
select pg_temp.offers(5, '9001:subscription,9001:rent');
select pg_temp.offers(6, '9001:subscription,9003:subscription');

update public.titles set trailer_key = 'trailerKey1', backdrop_path = '/back-1.jpg',
  poster_placeholder = 'placeholder1', poster_path = '/main-1.jpg'
where id = tests.film(1);
insert into public.title_translations (title_id, language, title, overview, poster_path)
values (tests.film(1), 'fr', 'Film Fictif 1', 'Resume fictif 1', '/fr-1.jpg');
insert into public.people (id, name) select 9100 + n, 'Actor ' || n from generate_series(1, 7) n;
insert into public.title_credits (title_id, person_id, role, ord)
select tests.film(7), 9100 + n, 'cast', 7 - n from generate_series(1, 7) n;

-- The card of a film as this player sees it (null when it is not in the first 30).
create function pg_temp.card(p_film integer, p_name text default 'p1') returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  select c into v from jsonb_array_elements(api.my_next_cards(tests.room_id(), 30)) c
  where (c->>'title_id')::bigint = tests.film(p_film);
  perform tests.clear_authentication();
  return v;
end $$;

-- T1: only the room's services.
select is(pg_temp.card(1)->'providers',
  '[{"provider_id": 9001, "kind": "subscription", "name": "Catalog Service 9001", "logo_path": null}]'::jsonb,
  'T1 a film on A and on a service nobody has lists only A');

-- T2: a variant's offer shows as its main service.
select is(pg_temp.card(2)->'providers',
  '[{"provider_id": 9001, "kind": "ads", "name": "Catalog Service 9001", "logo_path": null}]'::jsonb,
  'T2 a film only on A''s variant lists A');

-- T3: one entry per (service, kind).
select is(pg_temp.card(3)->'providers',
  '[{"provider_id": 9001, "kind": "subscription", "name": "Catalog Service 9001", "logo_path": null},
    {"provider_id": 9001, "kind": "ads", "name": "Catalog Service 9001", "logo_path": null}]'::jsonb,
  'T3 a film on A by subscription and on its variant by ads lists both kinds');
select is(jsonb_array_length(pg_temp.card(6)->'providers'), 1,
  'T3 the same kind on A and on its variant is listed once');

-- T4: a free service nobody picked, with its name and logo.
select is(pg_temp.card(4)->'providers',
  '[{"provider_id": 9004, "kind": "free", "name": "Test Free Service", "logo_path": "/free-logo.png"}]'::jsonb,
  'T4 a film on the country''s free service lists it with its name and logo');

-- T5: kinds outside offer_kinds.
select is(pg_temp.card(5)->'providers',
  '[{"provider_id": 9001, "kind": "subscription", "name": "Catalog Service 9001", "logo_path": null}]'::jsonb,
  'T5 a rental offer is not listed when the room does not take rentals');

-- T6: trailers and age caps.
update public.rooms set max_age = 12 where id = tests.room_id();
select is(pg_temp.card(1)->'trailer_key', 'null'::jsonb, 'T6 max_age 12: no trailer');
update public.rooms set max_age = 13 where id = tests.room_id();
select is(pg_temp.card(1)->>'trailer_key', 'trailerKey1', 'T6 max_age 13: the trailer');
update public.rooms set max_age = 16 where id = tests.room_id();
select is(pg_temp.card(1)->>'trailer_key', 'trailerKey1', 'T6 max_age 16: the trailer');
update public.rooms set max_age = null where id = tests.room_id();
select is(pg_temp.card(1)->>'trailer_key', 'trailerKey1', 'T6 no cap: the trailer');

-- T7: backdrop and poster rules (Q6.3, Q6.4).
select is(pg_temp.card(1)->>'backdrop_path', '/back-1.jpg', 'T7 the card carries the backdrop');
select is(pg_temp.card(2)->'backdrop_path', 'null'::jsonb, 'T7 a film without a backdrop has null');
select is(pg_temp.card(1, 'p2')->>'poster_path', '/main-1.jpg', 'T7 an English reader gets the main poster');
update public.profiles set language = 'fr' where id = tests.uid('p1');
select is(pg_temp.card(1)->>'poster_path', '/fr-1.jpg', 'T7 a French reader gets the French poster');
select is(pg_temp.card(1)->>'poster_placeholder', 'placeholder1', 'T7 the placeholder is the main poster''s');
select is(pg_temp.card(2)->>'poster_path', (select poster_path from public.titles where id = tests.film(2)),
  'T7 without a French poster, the main one');

-- T8: the first 5 cast members, in billing order.
select is(pg_temp.card(7)->'cast',
  '["Actor 7", "Actor 6", "Actor 5", "Actor 4", "Actor 3"]'::jsonb,
  'T8 seven cast members give the first 5 by billing order');

-- T9: nothing countable.
select is(
  (select count(*) from jsonb_object_keys(pg_temp.card(1)) k
   where k in ('like_count', 'nope_count', 'seen_count', 'super_like_count', 'group_score', 'min_fit', 'fits', 'score')),
  0::bigint, 'T9 a card has no counts, scores or fits');

-- T10: one call, up to 30 cards, every key, in deck order.
select tests.authenticate_as('p1');
select set_config('tests.cards', api.my_next_cards(tests.room_id(), 30)::text, true);
select is(jsonb_array_length(current_setting('tests.cards')::jsonb), 30, 'T10 one call returns 30 cards');
select is(
  (select count(*) from jsonb_array_elements(current_setting('tests.cards')::jsonb) c
   where not (c ?& array['title_id', 'tmdb_id', 'title', 'overview', 'year', 'runtime_min', 'genre_ids',
     'tmdb_score', 'tmdb_votes', 'poster_path', 'poster_placeholder', 'backdrop_path', 'trailer_key',
     'directors', 'cast', 'providers', 'watch_link', 'deck_source', 'reason_code', 'reason_params',
     'member_ratings'])),
  0::bigint, 'T10 every card has every key of the contract');
select is(
  (select array_agg((c->>'title_id')::bigint order by o) from jsonb_array_elements(current_setting('tests.cards')::jsonb) with ordinality x(c, o)),
  (select u[1:30] from (select tests.upcoming('p1') u) s), 'T10 the cards come in deck order');
select is(jsonb_array_length(api.my_next_cards(tests.room_id(), 0)), 1, 'T10 a limit of 0 gives 1');
select is(jsonb_array_length(api.my_next_cards(tests.room_id(), 100)), 30, 'T10 a limit of 100 gives 30');
select is(jsonb_array_length(api.my_next_cards(tests.room_id(), 7)), 7, 'T10 a limit of 7 gives 7');
select tests.clear_authentication();

-- T11: a removed seat.
update public.room_members set removed_at = now() where id = tests.member_id('p2');
select tests.authenticate_as('p2');
select is(api.my_next_cards(tests.room_id()), '[]'::jsonb, 'T11 a removed seat gets no cards');
select tests.clear_authentication();

select * from finish();
rollback;

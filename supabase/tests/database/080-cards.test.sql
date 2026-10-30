-- The cards a phone renders: my_next_cards and title_cards
-- (data-model.md#the-apps-api). Cards are checked by key, never whole, because
-- the payload changes in roadmap task M5.6. C6 is beyond the 120 checks of
-- data-model.md#what-was-tested.

begin;
select plan(14);

select tests.create_catalog(40);
select tests.deal_game(2);

-- p1 reads French, p2 English (the default). French texts for films 1 to 5;
-- film 1 has no English text. Film 1 also has a director, two actors, a watch
-- link, and a second service that nobody in the room has.
update public.profiles set language = 'fr' where id = tests.uid('p1');
insert into public.title_translations (title_id, language, title, overview)
select tests.title_id('Catalog Film 00' || n), 'fr', 'Film Fictif ' || n, 'Resume fictif ' || n
from generate_series(1, 5) n;
insert into public.people (id, name) values (9001, 'Dora Director'), (9002, 'Alma Actor'), (9003, 'Bo Actor');
insert into public.title_credits (title_id, person_id, role, ord) values
  (tests.title_id('Catalog Film 001'), 9001, 'director', 0),
  (tests.title_id('Catalog Film 001'), 9002, 'cast', 0),
  (tests.title_id('Catalog Film 001'), 9003, 'cast', 1);
insert into public.title_watch_links (title_id, country, tmdb_link)
values (tests.title_id('Catalog Film 001'), 'FR', 'https://example.test/watch/1');
select tests.create_provider(9002, 'Test Service B');
insert into public.title_availability (title_id, country, provider_id, kind)
values (tests.title_id('Catalog Film 001'), 'FR', 9002, 'subscription');

-- C1: 5 ready-to-render cards in French for a French profile.
select tests.authenticate_as('p1');
select set_config('tests.cards', api.my_next_cards(tests.room_id(), 5)::text, true);
select is(jsonb_array_length(current_setting('tests.cards')::jsonb), 5, 'C1 my_next_cards(5) returns 5 cards');
select is(
  (select array_agg((c->>'title_id')::bigint order by o) from jsonb_array_elements(current_setting('tests.cards')::jsonb) with ordinality x(c, o)),
  (select array_agg(tests.title_id('Catalog Film 00' || n) order by n) from generate_series(1, 5) n),
  'C1 the cards are films 1 to 5, in the deck''s order'
);
select is(
  (select array_agg(c->>'title' order by o) from jsonb_array_elements(current_setting('tests.cards')::jsonb) with ordinality x(c, o)),
  (select array_agg('Film Fictif ' || n order by n) from generate_series(1, 5) n),
  'C1 every title is the French one'
);
select is(
  (select array_agg(c->>'overview' order by o) from jsonb_array_elements(current_setting('tests.cards')::jsonb) with ordinality x(c, o)),
  (select array_agg('Resume fictif ' || n order by n) from generate_series(1, 5) n),
  'C1 every overview is the French one'
);

-- C2: director, cast, services, watch link and reason.
select is(current_setting('tests.cards')::jsonb->0->'directors', '["Dora Director"]'::jsonb,
  'C2 the first card carries its director');
select is(current_setting('tests.cards')::jsonb->0->'cast', '["Alma Actor", "Bo Actor"]'::jsonb,
  'C2 the first card carries its cast, in billing order');
select is(current_setting('tests.cards')::jsonb->0->'providers',
  '[{"provider_id": 9001, "kind": "subscription"}]'::jsonb,
  'C2 the first card lists only tonight''s services, not the one nobody in the room has');
select is(current_setting('tests.cards')::jsonb->0->>'watch_link', 'https://example.test/watch/1',
  'C2 the first card carries its watch link');
select is(current_setting('tests.cards')::jsonb->0->>'reason_code', 'runtime_fit',
  'C2 the first card carries its reason');

-- C3: no English text, so the original title shows.
select tests.authenticate_as('p2');
select is(
  (select c->>'title' from jsonb_array_elements(api.my_next_cards(tests.room_id(), 1)) c),
  'Catalog Film 001',
  'C3 an English profile gets the original title when the film has no English text'
);

-- C4: the shared opening order.
select tests.authenticate_as('p1');
select set_config('tests.p1_cards', api.my_next_cards(tests.room_id(), 10)::text, true);
select tests.authenticate_as('p2');
select set_config('tests.p2_cards', api.my_next_cards(tests.room_id(), 10)::text, true);
select is(
  (select array_agg(c->>'title_id' order by o) from jsonb_array_elements(current_setting('tests.p1_cards')::jsonb) with ordinality x(c, o)),
  (select array_agg(c->>'title_id' order by o) from jsonb_array_elements(current_setting('tests.p2_cards')::jsonb) with ordinality x(c, o)),
  'C4 both seats see the same 10 films in the same order'
);
select is(
  (select array_agg(distinct c->>'deck_source') from jsonb_array_elements(current_setting('tests.p1_cards')::jsonb) c),
  array['opening'],
  'C4 all 10 cards come from the opening'
);

-- C5: title_cards keeps the requested order.
select set_config('tests.asked', array[
  tests.title_id('Catalog Film 003'), tests.title_id('Catalog Film 001'), tests.title_id('Catalog Film 002')]::text, true);
select tests.authenticate_as('p1');
select is(
  (select array_agg((c->>'title_id')::bigint order by o)
   from jsonb_array_elements(api.title_cards(current_setting('tests.asked')::bigint[])) with ordinality x(c, o)),
  current_setting('tests.asked')::bigint[],
  'C5 title_cards returns the films in the order asked'
);

-- C6 (beyond the 120): another seat's cards are not returned.
select tests.authenticate_as('p2');
select is(api.my_next_cards(tests.room_id(), 5, tests.member_id('p1')), '[]'::jsonb,
  'C6 (beyond the 120) asking for another player''s seat returns no cards (p1 got 5 in C1)');

select tests.clear_authentication();
select * from finish();
rollback;

-- M5.9: api.title_cards serves only films in the caller's room (security.md#the-database-gaps-found,
-- gap 2). Country, services, offer kinds and the age cap come from the room; 50 films a call;
-- 30 calls per 10 minutes per profile. The taste check pool is not served here (Q9.2).

begin;
select plan(26);

select tests.create_catalog(40);
-- Room B (prefix q) is another room the p players are not in; its pool is films 11 and 12.
select tests.create_room(2, 'quick_match', 'FR', 'q');
select set_config('tests.room_b', tests.room_id()::text, true);
select tests.deal_game(3);
select tests.create_player('outsider', 'FR');

-- Room A's pool is films 1 to 10, set by hand.
delete from public.deck_entries where room_id = tests.room_id();
delete from public.room_cards where room_id = tests.room_id();
insert into public.room_cards (room_id, title_id, group_score)
select tests.room_id(), tests.film(n), 3 from generate_series(1, 10) n;
insert into public.room_cards (room_id, title_id, group_score)
select current_setting('tests.room_b')::uuid, tests.film(n), 3 from generate_series(11, 12) n;
update public.profiles set language = 'fr' where id = tests.uid('p1');

-- The ids of a card list, in the order served, as this player; the room defaults to room A.
create function pg_temp.ids(p_name text, p_films integer[], p_language text default null)
returns bigint[] language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.title_cards(tests.room_id(), (select array_agg(tests.film(f) order by o) from unnest(p_films) with ordinality x(f, o)), p_language);
  perform tests.clear_authentication();
  return (select coalesce(array_agg((c->>'title_id')::bigint order by o), '{}')
          from jsonb_array_elements(v->'cards') with ordinality x(c, o));
end $$;

-- The whole answer for a list of films.
create function pg_temp.answer(p_name text, p_ids bigint[], p_language text default null)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p_name);
  v := api.title_cards(tests.room_id(), p_ids, p_language);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.hits(p_name text) returns bigint language sql as $$
  select coalesce(sum(hits), 0) from public.rate_limits where key = 'title_cards:p:' || tests.uid(p_name)
$$;

-- T1: pool films come back in the order asked.
select is(pg_temp.ids('p1', array[3, 1, 2]), array[tests.film(3), tests.film(1), tests.film(2)],
  'T1 a member asking for 3 pool films gets 3 cards in the order asked');

-- T2: films outside the pool are left out, silently; the rest keep the order asked.
select is(pg_temp.ids('p1', array[20, 2, 21, 1]), array[tests.film(2), tests.film(1)],
  'T2 films outside the pool are left out and scraping the catalog returns nothing');

-- T3: a pool film of another room is not served.
select is(pg_temp.ids('p1', array[11, 12, 1]), array[tests.film(1)],
  'T3 a film in the pool of a room the caller is not in is not served');

-- T4: matched, finalist and dropped pool films are served.
update public.room_cards set state = 'dropped' where room_id = tests.room_id() and title_id = tests.film(4);
update public.room_cards set state = 'matched' where room_id = tests.room_id() and title_id = tests.film(5);
update public.room_cards set state = 'finalist' where room_id = tests.room_id() and title_id = tests.film(6);
select is(pg_temp.ids('p1', array[4, 5, 6]), array[tests.film(4), tests.film(5), tests.film(6)],
  'T4 dropped, matched and finalist pool films are served');

-- T5: the caller needs a seat that was not removed; a seat that left keeps reading.
select tests.authenticate_as('outsider');
select throws_ok(format('select api.title_cards(%L, array[%s]::bigint[])', tests.room_id(), tests.film(1)),
  '42501', null, 'T5 a caller with no seat in the room is refused');
select tests.clear_authentication();
update public.room_members set left_at = now() where id = tests.member_id('p3');
select is(pg_temp.answer('p3', array[tests.film(1)])->>'status', 'ok', 'T5 a seat that left still gets cards');
update public.room_members set removed_at = now() where id = tests.member_id('p2');
select tests.authenticate_as('p2');
select throws_ok(format('select api.title_cards(%L, array[%s]::bigint[])', tests.room_id(), tests.film(1)),
  '42501', null, 'T5 a removed seat is refused');
select tests.clear_authentication();

-- T6: over 50 films is refused and costs nothing; 50 is fine; an empty or null list is ok with no cards.
delete from public.rate_limits where key like 'title_cards:p:%';
select is(pg_temp.answer('p1', (select array_agg(g::bigint) from generate_series(1, 51) g)),
  jsonb_build_object('status', 'too_many', 'max', 50),
  'T6 51 ids answer too_many with the cap and no cards');
select is(pg_temp.hits('p1'), 0::bigint, 'T6 the refused call does not count toward the limit');
select is(pg_temp.answer('p1', (select array_agg(g::bigint) from generate_series(1, 50) g))->>'status', 'ok',
  'T6 50 ids are served');
select is(pg_temp.answer('p1', '{}'), jsonb_build_object('status', 'ok', 'cards', '[]'::jsonb),
  'T6 an empty list is ok with no cards');
select is(pg_temp.answer('p1', null), jsonb_build_object('status', 'ok', 'cards', '[]'::jsonb),
  'T6 a null list is ok with no cards');

-- T7: the 31st call in 10 minutes answers rate_limited; another player is unaffected.
delete from public.rate_limits where key like 'title_cards:p:%';
create function pg_temp.burst(p_name text, p_calls integer) returns integer language plpgsql as $$
declare v_ok integer := 0; i integer;
begin
  for i in 1..p_calls loop
    if pg_temp.answer(p_name, array[tests.film(1)])->>'status' = 'ok' then v_ok := v_ok + 1; end if;
  end loop;
  return v_ok;
end $$;
select is(pg_temp.burst('p1', 30), 30, 'T7 the first 30 calls are served');
select is(pg_temp.answer('p1', array[tests.film(1)]), jsonb_build_object('status', 'rate_limited'),
  'T7 the 31st call answers rate_limited');
select is(pg_temp.answer('p3', array[tests.film(1)])->>'status', 'ok',
  'T7 another player''s calls are unaffected');

-- T8: the room's age cap, services and variants shape the card.
select tests.create_provider(9002, 'Test Service B');
select tests.create_provider(9003, 'Test Service V');
update public.providers set parent_id = 9001 where id = 9003;
delete from public.title_availability where title_id in (tests.film(1), tests.film(2));
insert into public.title_availability (title_id, country, provider_id, kind) values
  (tests.film(1), 'FR', 9001, 'subscription'), (tests.film(1), 'FR', 9002, 'subscription'),
  (tests.film(2), 'FR', 9003, 'subscription');
update public.titles set trailer_key = 'trailerKey1' where id = tests.film(1);
update public.rooms set provider_ids = '{9001}', offer_kinds = '{subscription}', max_age = 10 where id = tests.room_id();
delete from public.rate_limits where key like 'title_cards:p:%';
create function pg_temp.card(p_film integer, p_name text default 'p1') returns jsonb language sql as $$
  select c from jsonb_array_elements(pg_temp.answer(p_name, array[tests.film(p_film)])->'cards') c
$$;
select is(pg_temp.card(1)->'trailer_key', 'null'::jsonb, 'T8 a room capped at 10 gets no trailer');
select is((select array_agg(p->>'provider_id') from jsonb_array_elements(pg_temp.card(1)->'providers') p),
  array['9001'], 'T8 the services listed are the room''s');
select is((select array_agg(p->>'provider_id') from jsonb_array_elements(pg_temp.card(2)->'providers') p),
  array['9001'], 'T8 a variant''s offer shows as its main service');
update public.rooms set max_age = null where id = tests.room_id();
select is(pg_temp.card(1)->>'trailer_key', 'trailerKey1', 'T8 without the cap the trailer is there');

-- T9: the language asked, else the profile's.
insert into public.title_translations (title_id, language, title, overview)
values (tests.film(1), 'fr', 'Film Fictif 1', 'Resume fictif 1');
select is(pg_temp.card(1, 'p1')->>'title', 'Film Fictif 1', 'T9 with no language the profile''s language is used');
select is(pg_temp.card(1, 'p3')->>'title', 'Catalog Film 001', 'T9 an English profile gets the English title');
select is((select c->>'title' from jsonb_array_elements(pg_temp.answer('p3', array[tests.film(1)], 'fr')->'cards') c),
  'Film Fictif 1', 'T9 the language asked wins over the profile''s');

-- T10: the old signatures are gone and the new one is closed to anon.
select is(to_regprocedure('api.title_cards(bigint[],text,character)'), null, 'T10 the old api.title_cards is gone');
select is(to_regprocedure('internal.card_payloads(bigint[],text,character,integer[])'), null,
  'T10 the old four-argument card_payloads is gone');
select is(has_function_privilege('anon', 'api.title_cards(uuid,bigint[],text)', 'execute'), false,
  'T10 anon cannot execute the new api.title_cards');
select is(has_function_privilege('authenticated', 'api.title_cards(uuid,bigint[],text)', 'execute'), true,
  'T10 authenticated can');

select * from finish();
rollback;

-- M6.65: the swipe card carries the caller's own seen and saved flags (decisions.md, 6 Nov 2026,
-- changing Q50.8). api.my_next_cards adds seen (the seat's player marked the film seen in My
-- films) and saved (the film is in their My films likes: a game like, a solo like, a save or a
-- group's pick). Both come from the seat's own user_titles rows (sources app and solo, as My films
-- reads them), read per seat at call time: a second seat sees its own flags, never another's.
-- No broadcast carries them (rule 6).

begin;
select plan(29);

select tests.create_catalog(40);
select tests.deal_game(2);

-- A film both seats still have to answer.
select set_config('tests.film', (
  select t::text from unnest(tests.upcoming('p1')) t
  where t = any (tests.upcoming('p2')) limit 1), true);
create function pg_temp.film() returns bigint language sql as $$
  select current_setting('tests.film')::bigint
$$;

-- The film's card as this seat sees it.
create function pg_temp.card(p text, t bigint default null) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  select c into v from jsonb_array_elements(api.my_next_cards(tests.room_id(), 30)) c
  where (c->>'title_id')::bigint = coalesce(t, current_setting('tests.film')::bigint);
  perform tests.clear_authentication();
  return v;
end $$;

-- A seen mark made in My films: the app row, as api.set_film_seen writes it.
create function pg_temp.mark_seen(p text) returns void language sql as $$
  insert into public.user_titles (profile_id, title_id, source, seen, seen_at)
  values (tests.uid(p), current_setting('tests.film')::bigint, 'app', true, now() - interval '1 day')
$$;

create function pg_temp.seen(p text, s boolean) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.set_film_seen(current_setting('tests.film')::bigint, s);
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.save(p text, s boolean) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.set_film_saved(current_setting('tests.film')::bigint, s);
  perform tests.clear_authentication();
  return v;
end $$;

select isnt(pg_temp.film(), null, 'both seats have a film in common to answer');

-- ---------------------------------------------------------------------------
-- Never set
-- ---------------------------------------------------------------------------
select is(pg_temp.card('p1')->'seen', 'false'::jsonb, 'M6.65: a film never marked seen has seen false');
select is(pg_temp.card('p1')->'saved', 'false'::jsonb, 'M6.65: a film never liked has saved false');
select is((select count(*)::integer from jsonb_array_elements(api.my_next_cards(tests.room_id(), 30)) c
           where not (c ? 'seen' and c ? 'saved')), 0,
          'M6.65: every card carries both flags')
from (select tests.authenticate_as('p1')) a;
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- Seen: the caller's own mark only
-- ---------------------------------------------------------------------------
select pg_temp.mark_seen('p1');
select is(pg_temp.card('p1')->'seen', 'true'::jsonb, 'M6.65: a film marked seen has seen true');
select is(pg_temp.card('p1')->'saved', 'false'::jsonb, 'M6.65: a seen mark is not a like');
select is(pg_temp.card('p2')->'seen', 'false'::jsonb,
          'M6.65 rule 6: another seat never sees p1''s seen mark');

select pg_temp.mark_seen('p2');
select is(pg_temp.seen('p1', false)->>'status', 'ok', 'p1 takes the seen mark back');
select is(pg_temp.card('p1')->'seen', 'false'::jsonb, 'M6.65: a removed seen mark gives seen false');
select is(pg_temp.card('p2')->'seen', 'true'::jsonb, 'M6.65: the second seat sees its own seen mark');
select is(pg_temp.seen('p2', false)->>'status', 'ok', 'p2 takes the seen mark back');

-- A seen mark from Letterboxd is not a My films mark (My films, Seen lists app and solo rows only).
select tests.connect_letterboxd('p1');
delete from public.user_titles where profile_id = tests.uid('p1') and source = 'letterboxd';
insert into public.user_titles (profile_id, title_id, source, linked_account_id, seen)
values (tests.uid('p1'), pg_temp.film(), 'letterboxd', tests.linked_account_id('p1'), true);
select is(pg_temp.card('p1')->'seen', 'false'::jsonb,
          'M6.65: a Letterboxd seen row alone is not a My films seen mark');
delete from public.user_titles where profile_id = tests.uid('p1') and source = 'letterboxd';

-- ---------------------------------------------------------------------------
-- Liked: a save, a like from an earlier game, a group's pick
-- ---------------------------------------------------------------------------
select is(pg_temp.save('p1', true)->>'status', 'ok', 'p1 saves the film');
select is(pg_temp.card('p1')->'saved', 'true'::jsonb, 'M6.65: a saved film has saved true');
select is(pg_temp.card('p1')->'seen', 'false'::jsonb, 'M6.65: a save is not a seen mark');
select is(pg_temp.card('p2')->'saved', 'false'::jsonb,
          'M6.65 rule 6: another seat never sees p1''s save');
select is(pg_temp.save('p1', false)->>'status', 'ok', 'p1 unsaves the film');
select is(pg_temp.card('p1')->'saved', 'false'::jsonb, 'M6.65: an unsaved film has saved false');

-- p2 liked the film in an earlier game: the like sits on their app row.
insert into public.user_titles (profile_id, title_id, source, liked_at)
values (tests.uid('p2'), pg_temp.film(), 'app', now() - interval '1 day');
select is(pg_temp.card('p2')->'saved', 'true'::jsonb, 'M6.65: a like from an earlier game has saved true');
select is(pg_temp.card('p1')->'saved', 'false'::jsonb, 'M6.65: the second seat sees its own likes, not p2''s');
delete from public.user_titles where profile_id = tests.uid('p2') and title_id = pg_temp.film();

-- A group's pick is in My films likes too.
insert into public.user_titles (profile_id, title_id, source, picked_at)
values (tests.uid('p2'), pg_temp.film(), 'app', now() - interval '1 day');
select is(pg_temp.card('p2')->'saved', 'true'::jsonb, 'M6.65: a group''s pick has saved true');
delete from public.user_titles where profile_id = tests.uid('p2') and title_id = pg_temp.film();

-- ---------------------------------------------------------------------------
-- Solo deals carry them too
-- ---------------------------------------------------------------------------
select tests.use_deck_engine('sql');
select tests.create_player('solo1');
insert into public.profile_providers (profile_id, provider_id) values (tests.uid('solo1'), 9001);
select tests.authenticate_as('solo1');
select set_config('tests.solo_room', api.start_solo()->>'room_id', true);
select set_config('tests.solo_film', (api.my_next_cards(current_setting('tests.solo_room')::uuid, 30)->0->>'title_id'), true);
select is(api.set_film_saved(current_setting('tests.solo_film')::bigint, true)->>'status', 'ok', 'solo1 saves a solo card');
select is((select c->'saved' from jsonb_array_elements(api.my_next_cards(current_setting('tests.solo_room')::uuid, 30)) c
           where c->>'title_id' = current_setting('tests.solo_film')), 'true'::jsonb,
          'M6.65: a solo card carries the player''s own flags');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------
-- api.title_cards: the room's films, with the caller's own flags
-- ---------------------------------------------------------------------------
select pg_temp.mark_seen('p1');
insert into public.user_titles (profile_id, title_id, source, liked_at)
values (tests.uid('p1'), pg_temp.film(), 'solo', now() - interval '1 day');

create function pg_temp.title_card(p text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.title_cards(tests.room_id(), array[current_setting('tests.film')::bigint])->'cards'->0;
  perform tests.clear_authentication();
  return v;
end $$;

select is(pg_temp.title_card('p1')->'seen', 'true'::jsonb, 'M6.65: title_cards carries the caller''s seen mark');
select is(pg_temp.title_card('p1')->'saved', 'true'::jsonb, 'M6.65: title_cards carries the caller''s like');
select is(pg_temp.title_card('p2')->'seen', 'false'::jsonb,
          'M6.65 rule 6: title_cards never shows another player''s seen mark');
select is(pg_temp.title_card('p2')->'saved', 'false'::jsonb,
          'M6.65 rule 6: title_cards never shows another player''s like');

-- ---------------------------------------------------------------------------
-- Never broadcast
-- ---------------------------------------------------------------------------
-- Every broadcast so far, the deal included: no payload has a seen or saved key at any depth.
select is((select count(*)::integer from realtime.messages m
           where jsonb_path_exists(m.payload, 'strict $.**.seen')
              or jsonb_path_exists(m.payload, 'strict $.**.saved')), 0,
          'M6.65 rule 6: no broadcast carries a seen or saved flag');
select cmp_ok((select count(*)::integer from realtime.messages m where m.topic = 'room:' || tests.room_id()), '>', 0,
              'the room did broadcast (so the check above read something)');

select * from finish();
rollback;

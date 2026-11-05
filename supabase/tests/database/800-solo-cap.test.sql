-- M6.42: the solo daily cap (game-modes.md#starting-values, solo-and-my-films.md section 8).
-- 100 solo cards a day per player, counted as swipe_log vote rows in the player's solo seats since
-- Paris midnight, set by app_config.solo_daily_cards. internal.deal_cards trims a solo seat's new
-- cards to what is left; api.start_solo and api.request_cards answer daily_limit. Group rooms are
-- never counted. Earlier answers are built as swipe_log rows in an ended solo room.

begin;
select plan(38);

select tests.create_catalog(25);
update public.titles set is_active = false where original_title not like 'Catalog Film %';
select tests.use_deck_engine('sql');

create function pg_temp.player(p text) returns void language plpgsql as $$
begin
  perform tests.create_player(p);
  insert into public.profile_providers (profile_id, provider_id) values (tests.uid(p), 9001);
end $$;

-- An ended solo room of this player with p_n answered cards at p_at.
create function pg_temp.past(p text, p_n integer, p_at timestamptz default now()) returns void
language plpgsql as $$
declare
  v_room uuid;
  v_seat uuid;
begin
  insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, state, ended_at)
  values (internal.new_room_code(), tests.uid(p), 'solo', 'FR', 1, 'hide_seen', 'done', now())
  returning id into v_room;
  insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key)
  values (v_room, tests.uid(p), tests.uid(p), 'host', p, 'fox')
  returning id into v_seat;
  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer, created_at)
  select v_room, v_seat, tests.film(1), 'vote', 'like', p_at from generate_series(1, p_n);
end $$;

create function pg_temp.solo(p text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.start_solo();
  perform tests.clear_authentication();
  if v->>'room_id' is not null then
    perform set_config('tests.room_id', v->>'room_id', true);
  end if;
  return v;
end $$;

-- The cards dealt to the player's seat in the last room.
create function pg_temp.deck(p text) returns bigint language sql as $$
  select count(*) from public.deck_entries d where d.room_member_id = tests.member_id(p)
$$;

create function pg_temp.request(p text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform tests.authenticate_as(p);
  v := api.request_cards(tests.room_id());
  perform tests.clear_authentication();
  return v;
end $$;

create function pg_temp.left_today(p text) returns integer language sql as $$
  select internal.solo_cards_left(tests.uid(p))
$$;

-- The start of today in Paris.
create function pg_temp.paris_midnight() returns timestamptz language sql as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'
$$;

-- As the deck worker: the 25 catalog films as the pool and as this player's deck.
create function pg_temp.server_deal(p text, p_candidates integer) returns jsonb language plpgsql as $$
declare
  v_room uuid := tests.room_id();
  v_titles bigint[];
  v jsonb;
begin
  select array_agg(x.id order by x.original_title) into v_titles from (
    select t.id, t.original_title from public.titles t
    where t.original_title like 'Catalog Film %' order by t.original_title limit 25) x;
  perform tests.act_as_server();
  v := internal.deal_cards(v_room, jsonb_build_object(
    'request', jsonb_build_object('kind', 'start', 'model_version', 'test', 'candidates', p_candidates, 'latency_ms', 1),
    'pool', (select jsonb_agg(jsonb_build_object('title_id', t, 'group_score', 4, 'min_fit', 3, 'source', 'ranked'))
             from unnest(v_titles) t),
    'decks', jsonb_build_array(jsonb_build_object('room_member_id', tests.member_id(p, v_room), 'keep', null,
      'cards', (select jsonb_agg(jsonb_build_object('title_id', t, 'source', 'ranked', 'score', 4, 'propensity', 0.5))
                from unnest(v_titles) t)))));
  perform tests.clear_authentication();
  return v;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The key, and nobody calls the count.
-- ---------------------------------------------------------------------------------------------
select is((select value from public.app_config where key = 'solo_daily_cards'), '100'::jsonb,
  'M6.42 app_config.solo_daily_cards is the number 100');
select is((select count(*) from unnest(array['anon', 'authenticated', 'app_server', 'app_http']) r
           where has_function_privilege(r, 'internal.solo_cards_left(uuid)', 'execute')),
  0::bigint, 'M6.42 no phone or server login can call solo_cards_left');

-- ---------------------------------------------------------------------------------------------
-- 1. The deal trims to what is left today.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('a');
select pg_temp.past('a', 95);
select is(pg_temp.left_today('a'), 5, 'M6.42 95 solo votes today leave 5 cards');
select is(pg_temp.solo('a')->>'status', 'ok', 'M6.42 start_solo with 5 cards left starts');
select is(pg_temp.deck('a'), 5::bigint, 'M6.42 the start dealt 5 cards, not 25');

select pg_temp.player('b');
select pg_temp.past('b', 92);
select pg_temp.solo('b');
select is(pg_temp.deck('b'), 8::bigint, 'M6.42 92 answered leave a deal of 8');
select tests.vote_next('b', 5);
select is(pg_temp.deck('b'), 8::bigint,
  'M6.42 97 answered and 3 unanswered: the refill deals nothing (cap minus answered minus unanswered)');
select is(pg_temp.left_today('b'), 3, 'M6.42 the 5 answers counted');

-- The deck worker's deal is trimmed the same way.
select tests.use_deck_engine('server');
select pg_temp.player('w');
select pg_temp.past('w', 95);
select is(pg_temp.solo('w')->>'status', 'dealing', 'M6.42 under the server engine the start waits for the deal');
select is(pg_temp.server_deal('w', 25)->>'status', 'ok', 'M6.42 the deck worker''s deal is accepted');
select is(pg_temp.deck('w'), 5::bigint, 'M6.42 the deck worker''s 25 cards are trimmed to 5');
select tests.use_deck_engine('sql');

-- ---------------------------------------------------------------------------------------------
-- 2. start_solo answers daily_limit and creates nothing.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('c');
select pg_temp.past('c', 100);
create temp table before_c as select count(*) as n from public.rooms;
grant all on before_c to public;
select is(pg_temp.solo('c'), '{"status": "daily_limit"}'::jsonb, 'M6.42 100 solo votes today: start_solo answers daily_limit');
select is((select count(*) from public.rooms), (select n from before_c), 'M6.42 the refused start created no room');

-- ---------------------------------------------------------------------------------------------
-- 3. request_cards in a solo room.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('d');
select pg_temp.solo('d');
select tests.vote_next('d', 22);
select pg_temp.past('d', 78);
select is(pg_temp.request('d')->>'status', 'daily_limit', 'M6.42 at the cap with 3 cards unanswered: daily_limit');

select pg_temp.player('e');
select pg_temp.solo('e');
select tests.vote_next('e', 17);
select pg_temp.past('e', 83);
select is(pg_temp.request('e')->>'status', 'enough', 'M6.42 at the cap with 8 cards unanswered: enough');

-- Over 5 unanswered is enough as before, whatever the day; at 5 or fewer with room left, as before.
select pg_temp.player('f');
select pg_temp.solo('f');
select tests.vote_next('f', 10);
select is(pg_temp.request('f')->>'status', 'enough', 'M6.42 under the cap with 15 cards unanswered: enough');
select tests.vote_next('f', 11);
select isnt(pg_temp.request('f')->>'status', 'daily_limit',
  'M6.42 positive control: 4 cards unanswered and 21 answered, plenty left today: not daily_limit');

-- The last card of the day answered: nothing is left to deal and the phone is told so, before done.
select pg_temp.player('g');
select pg_temp.past('g', 99);
select pg_temp.solo('g');
select tests.vote_next('g', 1);
select is(pg_temp.request('g')->>'status', 'daily_limit', 'M6.42 the last card of the day answered: daily_limit, not done');

-- ---------------------------------------------------------------------------------------------
-- 4. Undo gives nothing back.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('h');
select pg_temp.past('h', 98);
select pg_temp.solo('h');
select is(pg_temp.deck('h'), 2::bigint, 'M6.42 98 answered: two cards dealt');
select tests.vote_next('h', 1);
select tests.authenticate_as('h');
select is(api.undo_last_vote(tests.room_id())->>'status', 'ok', 'M6.42 the vote is undone');
select tests.clear_authentication();
select is(pg_temp.left_today('h'), 1, 'M6.42 undo gave nothing back: the undone vote still counts');
select tests.vote_next('h', 1);
select is(pg_temp.left_today('h'), 0, 'M6.42 answered again: 100 vote rows, the undo row deleted none');
select tests.vote_next('h', 1);
select is(pg_temp.left_today('h'), -1, 'M6.42 the last card makes 101 vote rows');
select is(pg_temp.deck('h'), 2::bigint, 'M6.42 no card was dealt after the undo');

-- ---------------------------------------------------------------------------------------------
-- 5. Group rooms are never counted nor capped.
-- ---------------------------------------------------------------------------------------------
select tests.use_deck_engine('server');
select tests.deal_game(2, 'g', 'dealing');
select pg_temp.past('g1', 100);
select is(pg_temp.left_today('g1'), 0, 'M6.42 positive control: g1 has used the whole solo day');
select is(pg_temp.server_deal('g1', 25)->>'status', 'ok', 'M6.42 the group deal is accepted');
select is((select count(*) from public.deck_entries d where d.room_member_id = tests.member_id('g1')), 25::bigint,
  'M6.42 100 solo votes today: the group deck is dealt in full');
select tests.use_deck_engine('sql');
select tests.vote_next('g1', 3);
select is((select count(*) from public.swipe_log s join public.rooms r on r.id = s.room_id
           where r.mode <> 'solo' and s.room_member_id = tests.member_id('g1')), 3::bigint,
  'M6.42 group votes are accepted over the cap');
select is(pg_temp.left_today('g1'), 0, 'M6.42 group votes do not count against the solo day');

-- ---------------------------------------------------------------------------------------------
-- 6. The day is the Paris day.
-- ---------------------------------------------------------------------------------------------
select pg_temp.player('i');
select pg_temp.past('i', 100, pg_temp.paris_midnight() - interval '30 minutes');
select is(pg_temp.left_today('i'), 100, 'M6.42 100 votes at 23:30 Paris time yesterday: the allowance is full again');
select is(pg_temp.solo('i')->>'status', 'ok', 'M6.42 start_solo is allowed again after Paris midnight');

select pg_temp.player('j');
select pg_temp.past('j', 100, pg_temp.paris_midnight() + interval '1 second');
select is(pg_temp.left_today('j'), 0,
  'M6.42 votes just after Paris midnight count for the new day, though it is still the day before in UTC');

-- ---------------------------------------------------------------------------------------------
-- 7. The key changes the cap.
-- ---------------------------------------------------------------------------------------------
update public.app_config set value = '10'::jsonb where key = 'solo_daily_cards';
select pg_temp.player('k');
select pg_temp.past('k', 4);
select is(pg_temp.left_today('k'), 6, 'M6.42 with solo_daily_cards 10, 4 answers leave 6');
select pg_temp.solo('k');
select is(pg_temp.deck('k'), 6::bigint, 'M6.42 the deal follows the key');
update public.app_config set value = '"many"'::jsonb where key = 'solo_daily_cards';
select is(pg_temp.left_today('k'), 96, 'M6.42 a value that is not a number reads as 100');
delete from public.app_config where key = 'solo_daily_cards';
select is(pg_temp.left_today('k'), 96, 'M6.42 a missing key reads as 100');
insert into public.app_config (key, value) values ('solo_daily_cards', '100'::jsonb);

-- ---------------------------------------------------------------------------------------------
-- 8. A solo room that finds too few films is abandoned, not sent back to the lobby.
-- ---------------------------------------------------------------------------------------------
select tests.use_deck_engine('server');
select pg_temp.player('l');
select pg_temp.solo('l');
select is(pg_temp.server_deal('l', 19)->>'status', 'too_few_films', 'M6.42 the deck worker found 19 films: too_few_films');
select is((select r.state::text from public.rooms r where r.id = tests.room_id()), 'abandoned',
  'M6.42 the solo room is abandoned (the sweeper ignores lobby rows)');

select * from finish();
rollback;

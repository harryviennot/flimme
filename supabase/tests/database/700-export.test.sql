-- M8.6: api.export_my_data matches the first release (privacy.md#players-rights-in-practice,
-- security.md#account-deletion-and-data-export). The caller's own data and nothing about anyone
-- else: no other seat's name, votes, ballots or swipes, and no reports.

begin;
select plan(36);

select tests.create_catalog(40);
select tests.create_player('outsider');

-- Room E: e1 hosts, e2 and e3 play. Made-up names for the others, so a text search can find a leak.
select tests.deal_game(3, 'e', 'swiping');
select set_config('tests.room_e', tests.room_id()::text, true);
update public.profiles set display_name = 'Zorblax' where id = tests.uid('e2');
update public.profiles set display_name = 'Quuxell' where id = tests.uid('e3');
update public.room_members set display_name = 'Zorblax' where id = tests.member_id('e2');
update public.room_members set display_name = 'Quuxell' where id = tests.member_id('e3');

insert into public.profile_providers (profile_id, provider_id) values (tests.uid('e1'), 9001)
  on conflict do nothing;
insert into public.consents (profile_id, kind, version, choice) values
  (tests.uid('e1'), 'analytics', 'wording-e1', 'on'),
  (tests.uid('e2'), 'analytics', 'wording-e2-secret', 'on');

-- e1: like 1, nope 2, like 3 then undo it, seen 4.
select tests.vote('e1', 1, 'like');
select tests.vote('e1', 2, 'nope');
select tests.vote('e1', 3, 'like');
select tests.authenticate_as('e1');
select api.undo_last_vote(tests.room_id());
select tests.clear_authentication();
select tests.vote('e1', 4, 'seen');
-- e2 and e3 vote on films e1 never saw.
select tests.vote('e2', 1, 'like');
select tests.vote('e2', 5, 'like');
select tests.vote('e2', 6, 'super_like');
select tests.vote('e3', 7, 'nope');

-- A seat e1 only controls, with a vote and a swipe of its own.
insert into public.room_members (id, room_id, profile_id, controlled_by, role, display_name, avatar_key)
values ('00000000-0000-4000-8000-0000000000c1', tests.room_id(), null, tests.uid('e1'), 'guest', 'Controlled Kid', 'a1');
insert into public.votes (room_id, room_member_id, title_id, answer)
values (tests.room_id(), '00000000-0000-4000-8000-0000000000c1', tests.film(8), 'like');
insert into public.swipe_log (room_id, room_member_id, title_id, action, answer)
values (tests.room_id(), '00000000-0000-4000-8000-0000000000c1', tests.film(8), 'vote', 'like');

-- Reports both ways between e1 and e2.
insert into public.member_reports (room_id, reporter_member_id, reported_member_id, reason) values
  (tests.room_id(), tests.member_id('e1'), tests.member_id('e2'), 'offensive_name'),
  (tests.room_id(), tests.member_id('e3'), tests.member_id('e1'), 'offensive_name');

-- The room's pick is film 1.
insert into public.matches (room_id, title_id, kind, like_count, present_count, pick_order)
values (tests.room_id(), tests.film(1), 'majority', 2, 3, 1)
on conflict (room_id, title_id) do update set pick_order = 1;

-- After-game answers.
update public.room_members set watched_answer = 'yes', post_reaction = 'love' where id = tests.member_id('e1');

select tests.authenticate_as('e1');
create temp table e_first as select api.export_my_data() as e;
create temp table e_second as select api.export_my_data() as e;
select tests.clear_authentication();

create function pg_temp.film_tmdb(p_n integer) returns integer language sql as
  $$ select t.tmdb_id from public.titles t where t.id = tests.film(p_n) $$;

-- T1: the profile, services and consents are the caller's.
select is((select e->>'status' from e_first), 'ok', 'T1 the export answers ok next to the data');
select is((select e->'profile'->>'id' from e_first), tests.uid('e1')::text, 'T1 the profile is the caller''s');
select ok(not (select e->'profile' ? 'auth_user_id' from e_first), 'T1 the profile has no auth_user_id');
select is((select e->'services' from e_first), '[9001]'::jsonb, 'T1 services are the caller''s');
select is((select jsonb_array_length(e->'consents') from e_first), 1, 'T1 one consent');
select is((select e->'consents'->0->>'version' from e_first), 'wording-e1', 'T1 the consent is the caller''s');
select ok((select e ?& array['linked_accounts', 'letterboxd_diary', 'film_history', 'taste', 'games'] from e_first),
  'T1 every earlier key is still there');

-- T2: votes with titles, and swipes including the undo.
select is((select jsonb_array_length(e->'games') from e_first), 1, 'T2 one game (the controlled seat is not in it)');
select is(
  (select array_agg((v->>'tmdb_id')::int || '/' || (v->>'answer') order by ord)
   from e_first, jsonb_array_elements(e->'games'->0->'votes') with ordinality x(v, ord)),
  array[pg_temp.film_tmdb(1) || '/like', pg_temp.film_tmdb(2) || '/nope', pg_temp.film_tmdb(4) || '/seen'],
  'T2 votes hold the remaining three, the undone one is gone');
select is(
  (select e->'games'->0->'votes'->0->>'title' from e_first),
  (select t.original_title from public.titles t where t.id = tests.film(1)),
  'T2 a vote carries its title');
select is(
  (select array_agg((s->>'action') || '/' || (s->>'tmdb_id')::int order by ord)
   from e_first, jsonb_array_elements(e->'games'->0->'swipes') with ordinality x(s, ord)),
  array['vote/' || pg_temp.film_tmdb(1), 'vote/' || pg_temp.film_tmdb(2), 'vote/' || pg_temp.film_tmdb(3),
        'undo/' || pg_temp.film_tmdb(3), 'vote/' || pg_temp.film_tmdb(4)],
  'T2 swipes hold every action in order, the undo included');
select ok(
  not exists (select 1 from e_first, jsonb_array_elements(e->'games'->0->'swipes') s
              where s ?| array['score', 'deck_source', 'room_member_id', 'id']),
  'T2 swipes carry no deck data');
select ok(
  (select (e->'games'->0) ?& array['room_id', 'joined_at', 'left_at', 'display_name', 'avatar_key', 'role',
                                   'joined_via', 'services', 'votes', 'swipes', 'ballots', 'pick',
                                   'watched_answer', 'post_reaction'] from e_first),
  'T2 a game has every field of the first release');
select is((select e->'games'->0->>'display_name' from e_first), 'e1', 'T2 the seat''s own name');
select is((select e->'games'->0->>'role' from e_first), 'host', 'T2 the seat''s role');
select is((select e->'games'->0->'services' from e_first), '[9001]'::jsonb, 'T2 the seat''s services that night');
select is((select e->'games'->0->>'watched_answer' from e_first), 'yes', 'T2 the watched answer');
select is((select e->'games'->0->>'post_reaction' from e_first), 'love', 'T2 the post reaction');

-- T3: the pick, and null when there is none.
select is((select (e->'games'->0->'pick'->>'tmdb_id')::int from e_first), pg_temp.film_tmdb(1), 'T3 the pick is the room''s');
select is((select e->'games'->0->'pick'->>'kind' from e_first), 'majority', 'T3 the pick carries its kind');
select ok((select jsonb_array_length(e->'games'->0->'ballots') = 0 from e_first), 'T3 no ballots in a game without a Final Cut');

-- T4: "Seen it" lands in film_history from the app.
select is(
  (select count(*) from e_first, jsonb_array_elements(e->'film_history') h
   where (h->>'tmdb_id')::int = pg_temp.film_tmdb(4) and h->>'source' = 'app' and (h->>'seen')::boolean),
  1::bigint, 'T4 film_history lists the seen film from the app');

-- T5: nothing of the other players, whatever field is searched.
select ok((select position('Zorblax' in e::text) = 0 and position('Quuxell' in e::text) = 0 from e_first),
  'T5 no other seat''s name');
select ok((select position('wording-e2-secret' in e::text) = 0 from e_first), 'T5 no other profile''s consent');
select ok((select position(tests.uid('e2')::text in e::text) = 0
                  and position(tests.member_id('e2')::text in e::text) = 0
                  and position(tests.member_id('e3')::text in e::text) = 0 from e_first),
  'T5 no other profile or seat id');
select ok(
  (select bool_and(position((select t.original_title from public.titles t where t.id = tests.film(n)) in e::text) = 0)
   from e_first, generate_series(5, 7) n),
  'T5 none of the films only the others voted on');

-- T6: the seat the caller controls but does not own is not in games.
select ok((select position('Controlled Kid' in e::text) = 0 and position(
              (select t.original_title from public.titles t where t.id = tests.film(8)) in e::text) = 0 from e_first),
  'T6 a controlled seat, its votes and swipes are not in the export');

-- T7: reports, made or received, are not in the export.
select ok((select position('offensive_name' in e::text) = 0 and not e ? 'reports' and not (e->'games'->0) ? 'reports'
           from e_first), 'T7 no report appears');

-- T8: a second call within the hour; no profile.
select is((select e from e_second), jsonb_build_object('status', 'rate_limited'), 'T8 the second call in the hour is rate_limited');
select tests.create_user('noprofile');
delete from public.profiles where id = tests.uid('noprofile');
select tests.authenticate_as('noprofile');
select throws_ok('select api.export_my_data()', '42501', null, 'T8 no profile raises 42501');
select tests.clear_authentication();

-- T9: a deleted second player (the seat turns anonymous) changes nothing in the caller's export.
delete from public.rate_limits where key = 'export:p:' || tests.uid('e1');
delete from auth.users where id = tests.uid('e2');
select tests.authenticate_as('e1');
create temp table e_after as select api.export_my_data() as e;
select tests.clear_authentication();
select is((select e from e_after), (select e from e_first), 'T9 the export is unchanged after the other player is deleted');

-- T3 again, T2 ballots: Room F, a Final Cut where f1 ranked and vetoed, with no pick.
create function pg_temp.finale(p_players integer, p_prefix text) returns void language plpgsql as $$
begin
  perform tests.deal_game(p_players, p_prefix, 'swiping');
  update public.room_members set joined_at = now() - interval '10 minutes' where room_id = tests.room_id();
  for i in 1..4 loop
    perform tests.vote(p_prefix || '1', i, 'like');
  end loop;
  update public.rooms set started_at = now() - interval '400 seconds' where id = tests.room_id();
  perform tests.vote(p_prefix || '1', 25, 'nope');
  if (select r.state::text from public.rooms r where r.id = tests.room_id()) <> 'finale' then
    raise exception 'pg_temp.finale: the finale did not open';
  end if;
end
$$;
select pg_temp.finale(3, 'f');
create function pg_temp.cast(p_name text, p_order integer[], p_veto integer default null) returns jsonb
language plpgsql as $$
declare
  v_round uuid := (select ro.id from public.rounds ro where ro.room_id = tests.room_id() order by ro.seq desc limit 1);
  v_films bigint[];
  v_veto bigint;
  v_answer jsonb;
begin
  select array_agg(rc.title_id order by x.o) into v_films
  from unnest(p_order) with ordinality x(s, o)
  join public.round_candidates rc on rc.round_id = v_round and rc.seed = x.s;
  select rc.title_id into v_veto from public.round_candidates rc where rc.round_id = v_round and rc.seed = p_veto;
  perform tests.authenticate_as(p_name);
  v_answer := api.cast_ballot(v_round, v_films, v_veto);
  perform tests.clear_authentication();
  return v_answer;
end
$$;
create temp table f_ballot as select pg_temp.cast('f1', array[1, 2, 3], 4) as a;
select pg_temp.cast('f2', array[2, 1, 3]);
select is((select a->>'status' from f_ballot), 'ok', 'T3 f1''s ballot is cast');

select tests.authenticate_as('f1');
create temp table f_export as select api.export_my_data() as e;
select tests.clear_authentication();
select is((select jsonb_array_length(e->'games'->0->'ballots') from f_export), 4, 'T3 f1''s ballots: three ranks and a veto');
select is(
  (select array_agg(b->>'kind' || coalesce('/' || (b->>'rank'), '') order by ord)
   from f_export, jsonb_array_elements(e->'games'->0->'ballots') with ordinality x(b, ord)),
  array['rank/1', 'rank/2', 'rank/3', 'veto'],
  'T3 the ballots hold the ranks then the veto');
select ok((select e->'games'->0->'pick' = 'null'::jsonb from f_export), 'T3 the pick is null in a room with none');
select ok((select position(tests.member_id('f2')::text in e::text) = 0 from f_export),
  'T5 f2''s ballot is not in f1''s export');

select * from finish();
rollback;

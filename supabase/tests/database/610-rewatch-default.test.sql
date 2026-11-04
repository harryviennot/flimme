-- M6.28: new rooms default to allow_rewatch (Quick Match, Final Cut); Date Night keeps hide_seen.
begin;
select plan(5);

select tests.create_player('host');
select tests.create_provider(8, 'Alpha');
insert into public.profile_providers (profile_id, provider_id) values (tests.uid('host'), 8);

create function pg_temp.open(p_mode text, p_settings jsonb) returns uuid
language plpgsql as $$
declare
  v_answer jsonb;
begin
  perform tests.authenticate_as('host');
  v_answer := api.create_room(p_mode, 'FR', p_settings);
  perform tests.clear_authentication();
  return (v_answer->>'room_id')::uuid;
end
$$;

create function pg_temp.rule_of(p_room uuid) returns text
language sql as $$ select seen_rule::text from public.rooms where id = p_room $$;

select is(pg_temp.rule_of(pg_temp.open('quick_match', null)), 'allow_rewatch', 'T1 Quick Match opens as allow_rewatch');
select is(pg_temp.rule_of(pg_temp.open('final_cut', null)), 'allow_rewatch', 'T2 Final Cut opens as allow_rewatch');
select is(pg_temp.rule_of(pg_temp.open('date_night', null)), 'hide_seen', 'T3 Date Night stays hide_seen');
select is(pg_temp.rule_of(pg_temp.open('quick_match', '{"seen_rule":"hide_seen"}')), 'hide_seen', 'T4 an explicit seen_rule wins');

create temp table old_room as select pg_temp.open('final_cut', null) as id;
update public.game_modes set defaults = defaults || '{"seen_rule":"hide_seen"}' where slug = 'final_cut';
select is(pg_temp.rule_of((select id from old_room)), 'allow_rewatch', 'T5 an existing room keeps its rule when the mode default changes');

select * from finish();
rollback;

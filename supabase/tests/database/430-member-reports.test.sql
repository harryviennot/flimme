-- M7.1: api.report_member stores a report on another seat of the same room
-- (store-listing.md#passing-review, guideline 1.2; security.md#starting-values).
-- Anyone unremoved can report anyone else, one report per pair, 10 an hour per
-- profile, no free text, nothing broadcast, and only the service role reads them.

begin;
select plan(25);

-- One call as a named player, back to the superuser afterwards. The answer is the status.
create function pg_temp.report(p_name text, p_target uuid, p_reason text default 'offensive_name',
                               p_room uuid default tests.room_id()) returns text
language plpgsql
as $$
declare v_status text;
begin
  perform tests.authenticate_as(p_name);
  v_status := api.report_member(p_room, p_target, p_reason)->>'status';
  perform tests.clear_authentication();
  return v_status;
end
$$;

-- Room B first (its seat is a foreign id for room A), then room A: p1 host, p2 to p5.
select tests.create_room(2, 'quick_match', 'FR', 'q');
create temp table room_b as select tests.member_id('q1') as member_id;
select tests.create_room(5);
select tests.create_player('x');   -- no seat anywhere

create temp table topic_count as
  select count(*) as n from realtime.messages where topic like 'room:' || tests.room_id() || '%';

-- T1: a guest reports another guest: ok, one row with both seats, the reason, a null alert.
select is(pg_temp.report('p2', tests.member_id('p3')), 'ok', 'T1 a guest reporting another guest answers ok');
select ok(
  exists (select 1 from public.member_reports r
          where r.room_id = tests.room_id() and r.reporter_member_id = tests.member_id('p2')
            and r.reported_member_id = tests.member_id('p3') and r.reason = 'offensive_name'
            and r.created_at is not null and r.alerted_at is null)
  and (select count(*) from public.member_reports) = 1,
  'T1 one row holds both seats, the reason, created_at and a null alerted_at');

-- T11 (measured here): a report broadcasts nothing on either room topic.
select is((select count(*) from realtime.messages where topic like 'room:' || tests.room_id() || '%'),
  (select n from topic_count), 'T11 a report sends nothing on room:<id> or room:<id>:live');

-- T2: the same seat reporting the same seat again writes nothing, whatever the reason.
select is(pg_temp.report('p2', tests.member_id('p3'), 'spam'), 'ok', 'T2 a repeat report answers ok');
select is((select count(*) from public.member_reports where reporter_member_id = tests.member_id('p2')
           and reported_member_id = tests.member_id('p3')), 1::bigint,
  'T2 a repeat writes no second row');

-- T3: anyone can report the host.
select is(pg_temp.report('p2', tests.member_id('p1'), 'other'), 'ok', 'T3 a guest can report the host');

-- T4: your own seat and an unknown reason raise 22023, and the unknown reason does not count.
create temp table before_p2_calls as
  select coalesce((select sum(hits) from public.rate_limits where key = 'report:p:' || tests.uid('p2')), 0) as hits;
select tests.authenticate_as('p2');
select throws_ok(
  format('select api.report_member(%L, %L, %L)', tests.room_id(), tests.member_id('p2'), 'spam'),
  '22023', null, 'T4 reporting your own seat raises 22023');
select throws_ok(
  format('select api.report_member(%L, %L, %L)', tests.room_id(), tests.member_id('p3'), 'rude'),
  '22023', null, 'T4 an unknown reason raises 22023');
select tests.clear_authentication();
select is(
  (select coalesce(sum(hits), 0) from public.rate_limits where key = 'report:p:' || tests.uid('p2')),
  (select hits from before_p2_calls),
  'T4 the unknown reason did not count against the limit');

-- T5: no seat in the room, or a seat of another room.
select is(pg_temp.report('x', tests.member_id('p1')), 'not_in_room', 'T5 a player with no seat answers not_in_room');
select is(pg_temp.report('p2', (select member_id from room_b)), 'not_in_room',
  'T5 a seat of another room answers not_in_room');

-- T6: a removed seat can't report.
update public.room_members set removed_at = now() where id = tests.member_id('p3');
select is(pg_temp.report('p3', tests.member_id('p1')), 'not_in_room', 'T6 a removed seat answers not_in_room');

-- T7: a seat that left can still report.
update public.room_members set left_at = now() where id = tests.member_id('p4');
select is(pg_temp.report('p4', tests.member_id('p1')), 'ok', 'T7 a seat that left can report a seat still there');

-- T8: a removed seat can be reported.
select is(pg_temp.report('p5', tests.member_id('p3')), 'ok', 'T8 a removed seat can be reported');

-- T9: in a done room too.
update public.rooms set state = 'done' where id = tests.room_id();
select is(pg_temp.report('p5', tests.member_id('p2'), 'spam'), 'ok', 'T9 a report in a done room answers ok');

-- T10: the 11th call in an hour is rate_limited and writes nothing.
select is(
  (select count(*) filter (where pg_temp.report('p1', tests.member_id('p2')) = 'ok') from generate_series(1, 10)),
  10::bigint, 'T10 ten calls by one profile in an hour answer ok');
select is(pg_temp.report('p1', tests.member_id('p5')), 'rate_limited', 'T10 the 11th call answers rate_limited');
select is((select count(*) from public.member_reports
           where reporter_member_id = tests.member_id('p1') and reported_member_id = tests.member_id('p5')),
  0::bigint, 'T10 the refused report wrote no row');

-- T12: phones never read or write the table; anon can't call the function.
select ok(
  not has_table_privilege('authenticated', 'public.member_reports', 'select')
  and not has_table_privilege('authenticated', 'public.member_reports', 'insert')
  and not has_table_privilege('authenticated', 'public.member_reports', 'update')
  and not has_table_privilege('authenticated', 'public.member_reports', 'delete'),
  'T12 authenticated has no privilege on member_reports');
select ok(
  not has_table_privilege('anon', 'public.member_reports', 'select')
  and not has_table_privilege('anon', 'public.member_reports', 'insert')
  and not has_table_privilege('anon', 'public.member_reports', 'update')
  and not has_table_privilege('anon', 'public.member_reports', 'delete'),
  'T12 anon has no privilege on member_reports');
select tests.authenticate_as('p2');
select throws_ok('select * from public.member_reports', '42501', null, 'T12 authenticated can not select the reports');
select tests.clear_authentication();
select ok(not has_function_privilege('anon', 'api.report_member(uuid, uuid, text)', 'execute'),
  'T12 anon can not execute api.report_member');
select ok(has_function_privilege('authenticated', 'api.report_member(uuid, uuid, text)', 'execute'),
  'T12 authenticated can execute api.report_member');
select ok((select relrowsecurity from pg_class where oid = 'public.member_reports'::regclass),
  'T12 row-level security is on');

-- T13: the reporter deletes their account: the report stays.
create temp table p2_seat as select tests.member_id('p2') as id, tests.member_id('p3') as target;
delete from auth.users where id = tests.uid('p2');
select ok(exists (select 1 from public.member_reports
                  where reporter_member_id = (select id from p2_seat) and reported_member_id = (select target from p2_seat)),
  'T13 a report stays after its reporter deletes their account');

select * from finish();
rollback;

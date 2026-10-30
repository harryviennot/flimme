-- When Letterboxd syncs are queued: on joining a room and by the hourly job
-- (data-model.md#what-was-tested, #queues-and-scheduled-jobs and
-- letterboxd.md#keeping-it-fresh).
--
-- Ids B28 to B32 and D1 are the checks of data-model.md#what-was-tested. Ids
-- ending in b are beyond the 120 (CLAUDE.md rule 4): B29b, B31b, B32b, D1b and
-- D3b. Time never passes in a test, so the columns are backdated instead
-- (last_synced_at, sync_requested_at, next_sync_after, profiles.last_seen_at).
--
-- The hourly job is called directly. Its return value is never pinned to an
-- exact count above 0, because the real stack may hold other due accounts; the
-- messages are always filtered by the account's own link id.
--
-- Players: lbn never synced; lbr synced 5 hours ago; lbo synced 7 hours ago;
-- lbd, lba and lbm are due for the job, last seen 1 day, 13 months and
-- 11 months ago.

begin;
select plan(21);

select tests.create_room(2);
select tests.create_player('lbn');
select tests.create_player('lbr');
select tests.create_player('lbo');
select tests.create_player('lbd');
select tests.create_player('lba');
select tests.create_player('lbm');

select tests.connect_letterboxd('lbn', 'test_viewer', false);
select tests.connect_letterboxd('lbr', 'test_viewer');
select tests.connect_letterboxd('lbo', 'test_viewer');
select tests.connect_letterboxd('lbd', 'test_viewer');
select tests.connect_letterboxd('lba', 'test_viewer');
select tests.connect_letterboxd('lbm', 'test_viewer');

update public.linked_accounts set last_synced_at = now() - interval '5 hours'
where id = tests.linked_account_id('lbr');
update public.linked_accounts set last_synced_at = now() - interval '7 hours'
where id = tests.linked_account_id('lbo');
update public.linked_accounts
set last_synced_at = now() - interval '15 days', next_sync_after = now() - interval '1 minute'
where id in (tests.linked_account_id('lbd'), tests.linked_account_id('lba'), tests.linked_account_id('lbm'));
update public.profiles set last_seen_at = now() - interval '1 day' where id = tests.uid('lbd');
update public.profiles set last_seen_at = now() - interval '13 months' where id = tests.uid('lba');
update public.profiles set last_seen_at = now() - interval '11 months' where id = tests.uid('lbm');

-- B28: joining a room queues one sync for a never-synced account.
select tests.authenticate_as('lbn');
select is(api.join_room(tests.room_code())->>'status', 'ok', 'B28 lbn joins the room');
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q
   where q->>'linked_account_id' = tests.linked_account_id('lbn')::text and q->>'reason' = 'joined_room'),
  1::bigint,
  'B28 one letterboxd_sync message with reason joined_room for the never-synced account'
);
select is(
  (select la.sync_requested_at = now() from public.linked_accounts la where la.id = tests.linked_account_id('lbn')),
  true,
  'B28 the request time is recorded'
);

-- D1: joining again does not queue it again.
select tests.authenticate_as('lbn');
select is(
  (select (a->>'status') || '/' || (a->>'rejoined') from (select api.join_room(tests.room_code()) as a) x),
  'ok/true',
  'D1 joining again answers ok with the same seat'
);
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = tests.linked_account_id('lbn')::text),
  1::bigint,
  'D1 still one message'
);

-- D1b (beyond the 120): after 10 minutes the next join asks again.
update public.linked_accounts set sync_requested_at = now() - interval '11 minutes'
where id = tests.linked_account_id('lbn');
select tests.authenticate_as('lbn');
select api.join_room(tests.room_code());
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = tests.linked_account_id('lbn')::text),
  2::bigint,
  'D1b (beyond the 120) a third join, 11 minutes after the request, queues a second message'
);

-- B29: joining queues none when the last sync is recent.
select tests.authenticate_as('lbr');
select api.join_room(tests.room_code());
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = tests.linked_account_id('lbr')::text),
  0::bigint,
  'B29 a player synced 5 hours ago gets no message when joining'
);
select is(
  (select la.sync_requested_at is null from public.linked_accounts la where la.id = tests.linked_account_id('lbr')),
  true,
  'B29 and no request time'
);

-- B29b (beyond the 120): the control, 7 hours is over the limit.
select tests.authenticate_as('lbo');
select api.join_room(tests.room_code());
select tests.clear_authentication();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q
   where q->>'linked_account_id' = tests.linked_account_id('lbo')::text and q->>'reason' = 'joined_room'),
  1::bigint,
  'B29b (beyond the 120) a player synced 7 hours ago gets one message when joining'
);

-- B30: the hourly job queues a due account.
select set_config('tests.job_1', internal.enqueue_due_letterboxd_syncs()::text, true);
select cmp_ok(current_setting('tests.job_1')::integer, '>=', 2, 'B30 the job queues at least the 2 due accounts (lbd and lbm)');
select is(
  (select count(*) from tests.queued('letterboxd_sync') q
   where q->>'linked_account_id' = tests.linked_account_id('lbd')::text and q->>'reason' = 'scheduled'),
  1::bigint,
  'B30 one scheduled message for the due account'
);
select is(
  (select la.sync_requested_at = now() from public.linked_accounts la where la.id = tests.linked_account_id('lbd')),
  true,
  'B30 its request time is recorded'
);

-- B31: it skips a player away 13 months.
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = tests.linked_account_id('lba')::text),
  0::bigint,
  'B31 no message for the player last seen 13 months ago'
);
select is(
  (select la.sync_requested_at is null from public.linked_accounts la where la.id = tests.linked_account_id('lba')),
  true,
  'B31 and no request time'
);
-- B31b (beyond the 120): the control, 11 months is still in.
select is(
  (select count(*) from tests.queued('letterboxd_sync') q
   where q->>'linked_account_id' = tests.linked_account_id('lbm')::text and q->>'reason' = 'scheduled'),
  1::bigint,
  'B31b (beyond the 120) one message for the player last seen 11 months ago'
);

-- B32: it doesn't queue twice within the hour.
select is(internal.enqueue_due_letterboxd_syncs(), 0, 'B32 a second call within the hour queues nothing');
select is(
  (select count(*) filter (where q->>'linked_account_id' = tests.linked_account_id('lbd')::text)
          || '/' || count(*) filter (where q->>'linked_account_id' = tests.linked_account_id('lbm')::text)
   from tests.queued('letterboxd_sync') q),
  '1/1',
  'B32 still one message each for lbd and lbm'
);

-- B32b (beyond the 120): an hour later the account is asked again.
update public.linked_accounts set sync_requested_at = now() - interval '61 minutes'
where id = tests.linked_account_id('lbd');
select internal.enqueue_due_letterboxd_syncs();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = tests.linked_account_id('lbd')::text),
  2::bigint,
  'B32b (beyond the 120) a request older than an hour is queued again'
);
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = tests.linked_account_id('lbm')::text),
  1::bigint,
  'B32b (beyond the 120) and the account requested a minute ago is not'
);

-- D3b (beyond the 120): deleting the account takes the link, imports and diary with it.
select set_config('tests.lbd_link', tests.linked_account_id('lbd')::text, true);
select cmp_ok(
  (select count(*) from public.letterboxd_entries e where e.linked_account_id = current_setting('tests.lbd_link')::uuid),
  '>=', 1::bigint,
  'D3b (beyond the 120) control: the account has diary entries before it is deleted'
);
delete from auth.users where id = tests.uid('lbd');
select is(
  (select (select count(*) from public.linked_accounts la where la.id = current_setting('tests.lbd_link')::uuid)
          || '/' || (select count(*) from public.imports i where i.linked_account_id = current_setting('tests.lbd_link')::uuid)
          || '/' || (select count(*) from public.letterboxd_entries e where e.linked_account_id = current_setting('tests.lbd_link')::uuid)),
  '0/0/0',
  'D3b (beyond the 120) no link, import or diary entry is left'
);

select * from finish();
rollback;

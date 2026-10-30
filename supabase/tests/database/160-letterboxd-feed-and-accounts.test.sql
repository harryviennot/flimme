-- Letterboxd after connecting: the feed sync, gaps, a second account with the
-- same username, disconnecting, the data export, and replacing the link
-- (data-model.md#what-was-tested, letterboxd.md#keeping-it-fresh,
-- #where-it-is-stored and #disconnecting-and-deleting).
--
-- Ids B14 to B27 and B33 are the checks of data-model.md#what-was-tested. Ids
-- ending in b or c are beyond the 120 (CLAUDE.md rule 4): B19b, B21b, B22b,
-- B25b, B25c and B33b. Every name here is made up (test_viewer, Feed Film 01).
--
-- The story runs in order in one transaction, so later checks build on earlier
-- ones. The server's calls go through tests.act_as_server(); queues are read
-- through tests.queued, filtered by profile id and reason. Never in this file:
-- two diary rows or feed items for the same film and watched date in one
-- payload (the insert would raise "cannot affect row a second time", found
-- while planning, for M20.3 and M20.5).

begin;
select plan(41);

select tests.create_player('lb1');
select tests.create_player('lb2');
select tests.create_player('lbz');
select tests.create_title('Letterboxd Film 7');

select tests.connect_letterboxd('lb1');
-- Last synced 15 days ago and due, with a request still marked: the feed sync must clear all three.
update public.linked_accounts
set last_synced_at = now() - interval '15 days',
    next_sync_after = now() - interval '1 day',
    sync_requested_at = now() - interval '5 minutes'
where id = tests.linked_account_id('lb1');
select set_config('tests.lb1_link', tests.linked_account_id('lb1')::text, true);

-- The feed: A is already in the diary, B is a rewatch with a lower rating, C comes off the
-- watchlist, D is a film that was not in the export.
select tests.act_as_server();
select set_config('tests.feed',
  internal.apply_letterboxd_feed(
    tests.linked_account_id('lb1'),
    jsonb_build_array(
      tests.feed_item('Letterboxd Film 1', date '2026-09-10'),
      tests.feed_item('Letterboxd Film 2', date '2026-10-20', 2.5, true),
      tests.feed_item('Letterboxd Film 4', date '2026-10-22', 3.5),
      tests.feed_item('Letterboxd Film 7', date '2026-10-25')),
    'W/"test-etag-1"', 'Wed, 28 Oct 2026 08:00:00 GMT')::text,
  true);
select tests.clear_authentication();

-- B14: a feed sync adds 3 new entries.
select is(
  (current_setting('tests.feed')::jsonb->>'status') || '/' || (current_setting('tests.feed')::jsonb->>'new'),
  'ok/3',
  'B14 the feed sync answers ok with 3 new entries'
);
select is(
  (select (select count(*) from public.letterboxd_entries e where e.linked_account_id = tests.linked_account_id('lb1'))
          || '/' || (select count(*) from public.letterboxd_entries e
                     where e.linked_account_id = tests.linked_account_id('lb1') and e.source = 'rss')),
  '6/3',
  'B14 the diary has 6 entries, 3 of them from the feed'
);
select is(
  (select array_agg(e.title_id order by e.title_id) from public.letterboxd_entries e
   where e.linked_account_id = tests.linked_account_id('lb1') and e.source = 'rss'),
  (select array_agg(x order by x) from (values (tests.title_id('Letterboxd Film 2')),
     (tests.title_id('Letterboxd Film 4')), (tests.title_id('Letterboxd Film 7'))) v(x)),
  'B14 the new entries have their film''s title id'
);
select is(
  (select ut.seen::text || '/' || ut.source::text from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 7')),
  'true/letterboxd',
  'B14 Film 7, new to the history, now has a letterboxd row, seen'
);

-- B15: it recognises an entry it already had, without duplicating it.
select is(
  (current_setting('tests.feed')::jsonb->>'known'),
  '1',
  'B15 the feed sync knows 1 entry it already had'
);
select is(
  (select count(*) || '/' || min(e.watched_on) || '/' || min(e.source) || '/' || min(e.rss_guid) || '/' || min(e.rating)
   from public.letterboxd_entries e
   where e.linked_account_id = tests.linked_account_id('lb1') and e.film_name = 'Letterboxd Film 1'),
  '1/2026-09-10/export/' || (tests.feed_item('Letterboxd Film 1', date '2026-09-10')->>'guid') || '/4.0',
  'B15 Film 1 still has one entry, from the export, now with the feed''s guid and its old rating'
);

-- B16: the latest rating wins, not the highest.
select is(
  (select ut.rating from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 2')),
  2.5,
  'B16 Film 2 takes the latest rating, 2.5, though the older one was 3.5'
);

-- B17: a rewatch is counted.
select is(
  (select ut.rewatch_count || '/' || ut.last_watched_on from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 2')),
  '1/2026-10-20',
  'B17 Film 2 has 1 rewatch and the new last watch date'
);

-- B18: a newly logged film comes off the watchlist.
select is(
  (select ut.seen || '/' || ut.on_watchlist || '/' || ut.rating from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 4')),
  'true/false/3.5',
  'B18 Film 4 is seen, off the watchlist, with the feed''s rating'
);

-- B19: the scheduled sync is pushed 14 days out.
select is(
  (select la.last_synced_at = now() and la.next_sync_after = now() + interval '14 days'
          and la.sync_requested_at is null
   from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  true,
  'B19 the sync is recorded and the next one is 14 days out, with no request left'
);

-- B20: so the 14-day job skips the account (B30 is the control: it queues a due one).
select internal.enqueue_due_letterboxd_syncs();
select is(
  (select count(*) from tests.queued('letterboxd_sync') q where q->>'linked_account_id' = current_setting('tests.lb1_link')),
  0::bigint,
  'B20 the job queued nothing for the freshly synced account'
);
select is(
  (select la.sync_requested_at is null from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  true,
  'B20 and left its request time empty'
);

-- B21: the etag is stored.
select is(
  (select la.feed_etag || '/' || la.feed_last_modified from public.linked_accounts la
   where la.id = tests.linked_account_id('lb1')),
  'W/"test-etag-1"/Wed, 28 Oct 2026 08:00:00 GMT',
  'B21 the etag and last-modified value are stored'
);

-- B19b (beyond the 120): the taste profile is refreshed once for the new entries.
select is(
  (select count(*) from tests.queued('taste_refresh') q
   where q->>'profile_id' = tests.uid('lb1')::text and q->>'reason' = 'letterboxd_feed'),
  1::bigint,
  'B19b (beyond the 120) one taste_refresh message with reason letterboxd_feed'
);

-- B21b (beyond the 120): an empty feed (a 304) changes nothing and keeps the etag.
select tests.act_as_server();
select set_config('tests.empty_feed',
  internal.apply_letterboxd_feed(tests.linked_account_id('lb1'), '[]', null, null)::text, true);
select tests.clear_authentication();
select is(
  (current_setting('tests.empty_feed')::jsonb->>'new') || '/' || (current_setting('tests.empty_feed')::jsonb->>'known')
    || '/' || (current_setting('tests.empty_feed')::jsonb->>'gap'),
  '0/0/false',
  'B21b (beyond the 120) an empty feed answers new 0, known 0 and no gap'
);
select is(
  (select la.feed_etag from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  'W/"test-etag-1"',
  'B21b (beyond the 120) the etag is kept when none is sent'
);
select is(
  (select count(*) from tests.queued('taste_refresh') q
   where q->>'profile_id' = tests.uid('lb1')::text and q->>'reason' = 'letterboxd_feed'),
  1::bigint,
  'B21b (beyond the 120) still one letterboxd_feed message'
);

-- B22: a full feed with nothing known flags a gap.
select tests.act_as_server();
select set_config('tests.gap_feed',
  internal.apply_letterboxd_feed(
    tests.linked_account_id('lb1'),
    (select jsonb_agg(tests.feed_item('Feed Film ' || lpad(n::text, 2, '0'), date '2026-01-01' + n) order by n)
     from generate_series(1, 50) n))::text,
  true);
select tests.clear_authentication();
select is(
  (current_setting('tests.gap_feed')::jsonb->>'gap') || '/' || (current_setting('tests.gap_feed')::jsonb->>'new'),
  'true/50',
  'B22 a feed of 50 new entries, none known, answers gap true'
);
select tests.authenticate_as('lb1');
select is(
  (select a.needs_new_export from api.my_linked_accounts a),
  true,
  'B22 the app is asked for a new export'
);
select tests.clear_authentication();

-- B22b (beyond the 120): a full feed that holds one known entry is not a gap.
select tests.connect_letterboxd('lbz', 'test_viewer_z');
select tests.act_as_server();
select set_config('tests.near_feed',
  internal.apply_letterboxd_feed(
    tests.linked_account_id('lbz'),
    (select jsonb_agg(x) from (
       select tests.feed_item('Feed Film ' || lpad(n::text, 2, '0'), date '2026-01-01' + n) as x
       from generate_series(1, 49) n) s)
    || jsonb_build_array(tests.feed_item('Letterboxd Film 1', date '2026-09-10')))::text,
  true);
select tests.clear_authentication();
select is(
  (current_setting('tests.near_feed')::jsonb->>'gap') || '/' || (current_setting('tests.near_feed')::jsonb->>'known'),
  'false/1',
  'B22b (beyond the 120) 49 new items plus one known entry answers no gap, known 1'
);
select is(
  (select la.gap_detected_at is null from public.linked_accounts la where la.id = tests.linked_account_id('lbz')),
  true,
  'B22b (beyond the 120) and the account is not flagged'
);

-- B23: the app is asked for a new export, which clears the gap.
select set_config('tests.lb1_count_before',
  (select count(*) from public.letterboxd_entries e where e.linked_account_id = tests.linked_account_id('lb1'))::text, true);
select tests.act_as_server();
select set_config('tests.reexport',
  internal.start_letterboxd_import(tests.uid('lb1'), tests.letterboxd_export('test_viewer'))::text, true);
select tests.clear_authentication();
select is(
  (current_setting('tests.reexport')::jsonb->>'status') || '/'
    || ((current_setting('tests.reexport')::jsonb->>'linked_account_id') = current_setting('tests.lb1_link')),
  'ok/true',
  'B23 a new export for the same username answers ok and keeps the link'
);
select tests.authenticate_as('lb1');
select is(
  (select a.needs_new_export from api.my_linked_accounts a),
  false,
  'B23 the gap is cleared'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.letterboxd_entries e where e.linked_account_id = tests.linked_account_id('lb1')),
  56::bigint,
  'B23 the diary still has 56 entries: 3 from the export, 3 from the feed and 50 from the full feed'
);
select set_config('tests.lb1_rows',
  (select count(*) from public.user_titles ut where ut.linked_account_id = tests.linked_account_id('lb1'))::text, true);

-- B24: a second account uploading the same username gets a separate copy.
select tests.connect_letterboxd('lb2', 'test_viewer');
select set_config('tests.lb2_link', tests.linked_account_id('lb2')::text, true);
select is(
  (select count(*) || '/' || count(distinct la.id) from public.linked_accounts la where la.username = 'test_viewer'),
  '2/2',
  'B24 two accounts link the same username, each with its own link'
);
select is(
  (select (select count(*) from public.letterboxd_entries e where e.linked_account_id = tests.linked_account_id('lb2'))
          || '/' || (select count(*) from public.user_titles ut where ut.linked_account_id = tests.linked_account_id('lb2'))
          || '/' || (select count(*) from public.letterboxd_entries e where e.linked_account_id = tests.linked_account_id('lb1'))),
  '3/5/56',
  'B24 the second copy has 3 entries and 5 film rows; the first still has 56 entries'
);
select tests.authenticate_as('lb2');
select is(
  (select count(*) || '/' || min(a.id::text) from api.my_linked_accounts a),
  '1/' || current_setting('tests.lb2_link'),
  'B24 lb2 sees only their own link'
);

-- B25: when that account disconnects, its data and consent go.
select is(api.disconnect_letterboxd()->>'status', 'ok', 'B25 disconnecting answers ok');
select tests.clear_authentication();
select is(
  (select (select count(*) from public.linked_accounts la where la.id = current_setting('tests.lb2_link')::uuid)
          || '/' || (select count(*) from public.imports i where i.linked_account_id = current_setting('tests.lb2_link')::uuid)
          || '/' || (select count(*) from public.letterboxd_entries e where e.linked_account_id = current_setting('tests.lb2_link')::uuid)
          || '/' || (select count(*) from public.user_titles ut where ut.profile_id = tests.uid('lb2') and ut.source = 'letterboxd')),
  '0/0/0/0',
  'B25 the link, its imports, its entries and its letterboxd film rows are gone'
);
select is(
  (select count(*) filter (where c.revoked_at = now()) || '/' || count(*) filter (where c.revoked_at is null)
   from public.consents c where c.profile_id = tests.uid('lb2') and c.kind = 'letterboxd_import'),
  '1/0',
  'B25 the consent is revoked and no active consent is left'
);
-- B25b (beyond the 120): the taste profile is rebuilt without it.
select is(
  (select count(*) from tests.queued('taste_refresh') q
   where q->>'profile_id' = tests.uid('lb2')::text and q->>'reason' = 'letterboxd_disconnected'),
  1::bigint,
  'B25b (beyond the 120) one taste_refresh message with reason letterboxd_disconnected'
);
-- B25c (beyond the 120): a queued sync for the disconnected link, and a second disconnect, are answers.
select set_config('tests.entries_total', (select count(*) from public.letterboxd_entries)::text, true);
select tests.authenticate_as('lb2');
select is(api.disconnect_letterboxd()->>'status', 'not_linked', 'B25c (beyond the 120) a second disconnect answers not_linked');
select tests.act_as_server();
select is(
  internal.apply_letterboxd_feed(current_setting('tests.lb2_link')::uuid,
    jsonb_build_array(tests.feed_item('Letterboxd Film 4', date '2026-10-22')))->>'status',
  'not_found',
  'B25c (beyond the 120) a feed for the disconnected link answers not_found'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.letterboxd_entries)::text || '/' || (select count(*) from public.linked_accounts
   where id = current_setting('tests.lb2_link')::uuid),
  current_setting('tests.entries_total') || '/0',
  'B25c (beyond the 120) and it wrote nothing'
);

-- B26: the first account's data is untouched.
select is(
  (select (la.id::text = current_setting('tests.lb1_link'))::text
          || '/' || (select count(*) from public.letterboxd_entries e where e.linked_account_id = la.id)
          || '/' || (select count(*) from public.user_titles ut where ut.linked_account_id = la.id)
          || '/' || (select count(*) from public.consents c
                     where c.profile_id = tests.uid('lb1') and c.kind = 'letterboxd_import' and c.revoked_at is null)
   from public.linked_accounts la where la.profile_id = tests.uid('lb1')),
  'true/56/' || current_setting('tests.lb1_rows') || '/1',
  'B26 the first account keeps its link, 56 entries, its film rows and its consent'
);

-- B33: the data export includes the username.
select tests.authenticate_as('lb1');
select is(
  (select jsonb_array_length(d->'linked_accounts') || '/' || (d->'linked_accounts'->0->>'provider')
          || '/' || (d->'linked_accounts'->0->>'username')
   from (select api.export_my_data() as d) x),
  '1/letterboxd/test_viewer',
  'B33 the data export lists the Letterboxd link with its username'
);
-- B33b (beyond the 120): and the whole diary.
select is(
  (select jsonb_array_length(api.export_my_data()->'letterboxd_diary')),
  56,
  'B33b (beyond the 120) the data export holds the 56 diary entries'
);
select tests.clear_authentication();

-- B27 (last): a different username replaces the old link and everything that came with it.
select tests.act_as_server();
select set_config('tests.replaced',
  internal.start_letterboxd_import(tests.uid('lb1'), tests.letterboxd_export('test_viewer_new'))::text, true);
select tests.clear_authentication();
select is(
  (current_setting('tests.replaced')::jsonb->>'status') || '/'
    || ((current_setting('tests.replaced')::jsonb->>'linked_account_id') <> current_setting('tests.lb1_link')),
  'ok/true',
  'B27 a different username answers ok with a new link'
);
select is(
  (select (select count(*) from public.linked_accounts la where la.id = current_setting('tests.lb1_link')::uuid)
          || '/' || (select count(*) from public.letterboxd_entries e where e.linked_account_id = current_setting('tests.lb1_link')::uuid)
          || '/' || (select count(*) from public.user_titles ut where ut.linked_account_id = current_setting('tests.lb1_link')::uuid)
          || '/' || (select count(*) from public.imports i where i.linked_account_id = current_setting('tests.lb1_link')::uuid)),
  '0/0/0/0',
  'B27 the old link, its entries, film rows and imports are gone'
);
select is(
  (select count(*) || '/' || min(la.username) from public.linked_accounts la where la.profile_id = tests.uid('lb1')),
  '1/test_viewer_new',
  'B27 the player has one link, with the new username'
);
select is(
  (select count(*) from public.letterboxd_entries e where e.linked_account_id = tests.linked_account_id('lb1')),
  3::bigint,
  'B27 the new link holds the 3 entries of the new export'
);

select * from finish();
rollback;

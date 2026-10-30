-- Connecting Letterboxd by uploading the player's own export: starting the
-- import, matching, finishing it, and who may do what
-- (data-model.md#what-was-tested, letterboxd.md#connecting, #the-export-file
-- and #where-it-is-stored, security.md#the-servers-http-api-and-letterboxd-uploads).
--
-- Ids B1 to B13 are the checks of data-model.md#what-was-tested. Ids ending in b
-- are beyond the 120 (CLAUDE.md rule 4): B1b, B2b, B3b, B6b, B7b and B13b.
-- Every name here is made up (test_viewer, Letterboxd Film 1, example.test links).
--
-- The server's calls go through tests.act_as_server(). Queues are read only
-- through tests.queued, filtered by profile id and reason, so other rows of the
-- same queue never matter. Nothing here pins the 80% refusal or the matching
-- rules of the server (M20.3, M20.4): the database only stores the share.

begin;
select plan(52);

select tests.create_player('lb1');
select tests.create_player('lb2');
select set_config('tests.payload', tests.letterboxd_export('Test_Viewer')::text, true);

-- B1: phones cannot start an import, and a refused call leaves nothing behind.
select tests.authenticate_as('lb1');
select throws_ok(
  $$select internal.start_letterboxd_import(tests.uid('lb1'), current_setting('tests.payload')::jsonb)$$,
  '42501', null,
  'B1 a signed-in phone cannot start an import'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$select internal.start_letterboxd_import(tests.uid('lb1'), current_setting('tests.payload')::jsonb)$$,
  '42501', null,
  'B1 a caller with no sign-in cannot start an import'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.linked_accounts la where la.profile_id = tests.uid('lb1')),
  0::bigint,
  'B1 the refused calls left no link (B2 is the control: the server can)'
);

-- B2b (beyond the 120): a username that is not letters, digits and underscores is an answer.
select tests.act_as_server();
select is(
  internal.start_letterboxd_import(tests.uid('lb1'),
    jsonb_set(current_setting('tests.payload')::jsonb, '{username}', to_jsonb('not a name!'::text)))->>'status',
  'invalid_username',
  'B2b (beyond the 120) a username with spaces and punctuation answers invalid_username'
);
select is(
  internal.start_letterboxd_import(tests.uid('lb1'),
    jsonb_set(current_setting('tests.payload')::jsonb, '{username}', to_jsonb(''::text)))->>'status',
  'invalid_username',
  'B2b (beyond the 120) an empty username answers invalid_username'
);
select tests.clear_authentication();
select is(
  (select count(*) from public.linked_accounts la where la.profile_id = tests.uid('lb1')),
  0::bigint,
  'B2b (beyond the 120) the refused usernames left no link'
);
select is(
  (select count(*) from public.consents c where c.profile_id = tests.uid('lb1')),
  0::bigint,
  'B2b (beyond the 120) the refused usernames left no consent'
);

-- The real start. Its answer is kept for the checks below.
select tests.act_as_server();
select set_config('tests.start',
  internal.start_letterboxd_import(tests.uid('lb1'), current_setting('tests.payload')::jsonb)::text, true);
select tests.clear_authentication();

-- B2: the username comes from the export, in lower case.
select is(
  (current_setting('tests.start')::jsonb->>'status') || '/' || (current_setting('tests.start')::jsonb->>'films')
    || '/' || (current_setting('tests.start')::jsonb->>'entries'),
  'ok/6/3',
  'B2 start answers ok with 6 films and 3 diary entries'
);
select is(
  (current_setting('tests.start')::jsonb->>'linked_account_id')::uuid = tests.linked_account_id('lb1')
    and (current_setting('tests.start')::jsonb->>'import_id') is not null,
  true,
  'B2 start answers the link id and an import id'
);
select is(
  (select la.username from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  'test_viewer',
  'B2 the stored username is the one from the export, in lower case'
);

-- B3: consent is recorded, and the link points at it.
select is(
  (select count(*) || '/' || min(c.version) from public.consents c
   where c.profile_id = tests.uid('lb1') and c.kind = 'letterboxd_import' and c.revoked_at is null),
  '1/test-1',
  'B3 one active letterboxd_import consent, with the version the phone sent'
);
select is(
  (select la.consent_id from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  (select c.id from public.consents c
   where c.profile_id = tests.uid('lb1') and c.kind = 'letterboxd_import' and c.revoked_at is null),
  'B3 the link points at that consent'
);

-- B3b (beyond the 120): the database stores the share the server found, and when.
select is(
  (select la.rss_match_share from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  0.95::real,
  'B3b (beyond the 120) the rss match share is stored'
);
select is(
  (select la.rss_checked_at = now() from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  true,
  'B3b (beyond the 120) the time of the check is stored'
);

-- B4: the films are staged, and nothing is applied before matching.
select is(
  (select string_agg(r.film_name || ':' || r.film_year || ':' || r.watched || ':' || r.on_watchlist || ':' || r.status,
                     ',' order by r.id)
   from public.import_rows r where r.import_id = (current_setting('tests.start')::jsonb->>'import_id')::uuid),
  'Letterboxd Film 1:2001:true:false:pending,Letterboxd Film 2:2001:true:false:pending,'
  'Letterboxd Film 3:2001:true:false:pending,Letterboxd Film 4:2001:false:true:pending,'
  'Letterboxd Film 5:2001:true:true:pending,Letterboxd Film 6:2001:true:false:pending',
  'B4 six pending rows, with the names, years and flags as sent'
);
select is(
  (select i.kind::text || '/' || i.status::text || '/' || i.films_total from public.imports i
   where i.id = (current_setting('tests.start')::jsonb->>'import_id')::uuid),
  'export/matching/6',
  'B4 the import is an export, waiting for matching, with 6 films'
);
select is(
  (select count(*) from public.user_titles ut where ut.profile_id = tests.uid('lb1')),
  0::bigint,
  'B4 no film rows exist before the films are matched'
);

-- B5: the diary is stored.
select is(
  (select count(*) || '/' || min(e.source) || '/' || count(e.title_id) from public.letterboxd_entries e
   where e.linked_account_id = tests.linked_account_id('lb1')),
  '3/export/0',
  'B5 three diary entries from the export, with no film matched yet'
);
select is(
  (select e.watched_on || '/' || e.logged_on || '/' || e.rating from public.letterboxd_entries e
   where e.linked_account_id = tests.linked_account_id('lb1') and e.film_name = 'Letterboxd Film 1'),
  '2026-09-10/2026-09-11/4.0',
  'B5 Film 1''s entry has its watched date, logged date and rating'
);

-- Matching and finishing, as the server does.
select is(
  tests.match_letterboxd_import((current_setting('tests.start')::jsonb->>'import_id')::uuid),
  5,
  'B6 setup: the matching step finds the 5 films in the catalog'
);
select tests.act_as_server();
select set_config('tests.finish',
  internal.finish_letterboxd_import((current_setting('tests.start')::jsonb->>'import_id')::uuid)::text, true);
select tests.clear_authentication();

-- B6: after matching, 5 films are applied.
select is(
  (current_setting('tests.finish')::jsonb->>'status') || '/' || (current_setting('tests.finish')::jsonb->>'matched')
    || '/' || (current_setting('tests.finish')::jsonb->>'unmatched'),
  'ok/5/1',
  'B6 finish answers ok with 5 matched and 1 unmatched'
);
select is(
  (select count(*) from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.source = 'letterboxd'
     and ut.linked_account_id = tests.linked_account_id('lb1')),
  5::bigint,
  'B6 five film rows with source letterboxd, pointing at the link'
);
select is(
  (select i.status::text || '/' || i.films_matched || '/' || i.films_unmatched || '/' || (i.finished_at is not null)
   from public.imports i where i.id = (current_setting('tests.start')::jsonb->>'import_id')::uuid),
  'done/5/1/true',
  'B6 the import is done, with its counts and a finish time'
);
select is(
  (select count(*) from public.import_rows r
   where r.import_id = (current_setting('tests.start')::jsonb->>'import_id')::uuid and r.status = 'matched'),
  0::bigint,
  'B6 no matched row is left in the staging table'
);

-- B7: one film is left for the fix screen.
select is(
  (select count(*) || '/' || min(r.film_name) || '/' || min(r.status) from public.import_rows r
   where r.import_id = (current_setting('tests.start')::jsonb->>'import_id')::uuid),
  '1/Letterboxd Film 6/unmatched',
  'B7 one row remains: Film 6, unmatched'
);
select tests.authenticate_as('lb1');
select is(
  (select count(*) || '/' || min(f.film_name) from api.my_unmatched_films f),
  '1/Letterboxd Film 6',
  'B7 my_unmatched_films lists exactly that film'
);
select tests.clear_authentication();

-- B8 to B12: what the film rows hold.
-- B8: ratings come only from the diary.
select is(
  (select string_agg(t.original_title || ':' || ut.rating, ',' order by t.original_title)
   from public.user_titles ut join public.titles t on t.id = ut.title_id
   where ut.profile_id = tests.uid('lb1') and ut.rating is not null),
  'Letterboxd Film 1:4.0,Letterboxd Film 2:3.5',
  'B8 only Films 1 and 2 are rated (4 and 3.5); the stray rating on Film 3 is ignored'
);
-- B9: a film watched without a diary entry is seen, with no rating.
select is(
  (select ut.seen || '/' || coalesce(ut.rating::text, 'none') || '/' || ut.rewatch_count
   from public.user_titles ut where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 3')),
  'true/none/0',
  'B9 Film 3 is seen, with no rating and no rewatch'
);
-- B10: watch dates and the watchlist are kept.
select is(
  (select ut.last_watched_on from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 1')),
  date '2026-09-10',
  'B10 Film 1 keeps its last watch date'
);
select is(
  (select ut.seen || '/' || ut.on_watchlist from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 4')),
  'false/true',
  'B10 Film 4 is on the watchlist and not seen'
);
-- B11: a film re-added to the watchlist after an older watch stays on it.
select is(
  (select ut.seen || '/' || ut.on_watchlist from public.user_titles ut
   where ut.profile_id = tests.uid('lb1') and ut.title_id = tests.title_id('Letterboxd Film 5')),
  'true/true',
  'B11 Film 5, watched in 2025 and on the watchlist, is seen and still on it'
);
-- B12: diary entries get their film.
select is(
  (select array_agg(e.title_id order by e.title_id) from public.letterboxd_entries e
   where e.linked_account_id = tests.linked_account_id('lb1')),
  (select array_agg(tests.title_id('Letterboxd Film ' || n) order by tests.title_id('Letterboxd Film ' || n))
   from unnest(array[1, 2, 5]) n),
  'B12 the three entries have the films of Films 1, 2 and 5'
);

-- B13: the export counts as a sync, with the next one in 14 days.
select is(
  (select la.last_synced_at = now() and la.next_sync_after = now() + interval '14 days'
   from public.linked_accounts la where la.id = tests.linked_account_id('lb1')),
  true,
  'B13 the export is a sync: last_synced_at is now and the next one is 14 days out'
);
-- B13b (beyond the 120): the taste profile is refreshed once.
select is(
  (select count(*) from tests.queued('taste_refresh') q
   where q->>'profile_id' = tests.uid('lb1')::text and q->>'reason' = 'letterboxd_export'),
  1::bigint,
  'B13b (beyond the 120) one taste_refresh message with reason letterboxd_export'
);

-- B6b (beyond the 120): the same message twice does nothing the second time.
select tests.act_as_server();
select is(
  internal.finish_letterboxd_import((current_setting('tests.start')::jsonb->>'import_id')::uuid)->>'status',
  'not_found',
  'B6b (beyond the 120) a second finish answers not_found'
);
select tests.clear_authentication();
select is(
  (select (select count(*) from public.user_titles ut where ut.profile_id = tests.uid('lb1'))
          || '/' || i.status::text || '/' || i.films_matched
   from public.imports i where i.id = (current_setting('tests.start')::jsonb->>'import_id')::uuid),
  '5/done/5',
  'B6b (beyond the 120) still 5 film rows, and the import is unchanged'
);

-- B7b (beyond the 120): a player sees only their own link, imports and unmatched films.
select tests.authenticate_as('lb2');
select is((select count(*) from api.my_linked_accounts), 0::bigint, 'B7b (beyond the 120) lb2 sees no linked account');
select is((select count(*) from api.my_imports), 0::bigint, 'B7b (beyond the 120) lb2 sees no import');
select is((select count(*) from api.my_unmatched_films), 0::bigint, 'B7b (beyond the 120) lb2 sees no unmatched film');
select tests.authenticate_as('lb1');
select is(
  (select count(*) || '/' || min(a.username) || '/' || bool_or(a.needs_new_export) from api.my_linked_accounts a),
  '1/test_viewer/false',
  'B7b (beyond the 120) control: lb1 sees their one link, with no new export needed'
);
select is((select count(*) from api.my_imports), 1::bigint, 'B7b (beyond the 120) control: lb1 sees their import');
select is((select count(*) from api.my_unmatched_films), 1::bigint, 'B7b (beyond the 120) control: lb1 sees the unmatched film');

-- B1b (beyond the 120): phones cannot call the server's functions or read or write the tables behind the views.
select throws_ok(
  $$select internal.finish_letterboxd_import(gen_random_uuid())$$, '42501', null,
  'B1b (beyond the 120) a phone cannot finish an import'
);
select throws_ok(
  $$select internal.apply_letterboxd_feed(gen_random_uuid(), '[]')$$, '42501', null,
  'B1b (beyond the 120) a phone cannot apply a feed'
);
select throws_ok(
  $$select internal.enqueue_due_letterboxd_syncs()$$, '42501', null,
  'B1b (beyond the 120) a phone cannot run the hourly job'
);
select throws_ok(
  $$select count(*) from public.letterboxd_entries$$, '42501', null,
  'B1b (beyond the 120) a phone cannot read diary entries directly'
);
select throws_ok(
  $$select count(*) from public.user_titles$$, '42501', null,
  'B1b (beyond the 120) a phone cannot read film rows directly'
);
select throws_ok(
  $$select count(*) from public.consents$$, '42501', null,
  'B1b (beyond the 120) a phone cannot read consents directly'
);
select throws_ok(
  $$insert into public.linked_accounts (profile_id, provider, username, consent_id)
    values (tests.uid('lb1'), 'letterboxd', 'someone_else', gen_random_uuid())$$,
  '42501', null,
  'B1b (beyond the 120) a phone cannot link a typed username'
);
select tests.clear_authentication();
select cmp_ok((select count(*) from public.letterboxd_entries), '>=', 1::bigint,
  'B1b (beyond the 120) control: diary entries exist');
select cmp_ok((select count(*) from public.user_titles), '>=', 1::bigint,
  'B1b (beyond the 120) control: film rows exist');
select cmp_ok((select count(*) from public.consents), '>=', 1::bigint,
  'B1b (beyond the 120) control: consents exist');

select * from finish();
rollback;

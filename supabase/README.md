# supabase/

The Supabase project: local settings, migrations, seed data and pgTAP tests. The design behind it is in [docs/architecture/data-model.md](../docs/architecture/data-model.md), the move from the reference DDL to migrations in [operations.md](../docs/architecture/operations.md#from-schemasql-to-migrations).

```
supabase/
  config.toml              local development settings for the Supabase CLI
  migrations/              the schema: the baseline migration, then one file per change
  seed.sql                 synthetic seed data: a comment until roadmap task M1.14
  tests/database/          pgTAP tests, run by `supabase test db`
  lite/                    the lite database for cloud sessions (see lite/README.md)
```

## config.toml

Made from the CLI's own template (`npx supabase@latest init`, CLI 2.122.0) with these changes: `project_id = "flimme"`, the Data API exposes only the `api` schema, anonymous sign-ins on, Realtime on (already the default), seed from `./seed.sql`, `[db] major_version = 17`. Version 17 is what `supabase init` writes today and what Supabase says new projects get; the lite database runs on Postgres 16 because that is what the cloud image has.

The CLI's config loader accepts the file (`supabase status` gets past it to the Docker step; a wrong value fails with the key's name). **To verify on the Mac with `supabase start`**, which can't run in a cloud session:

- the stack starts with Postgres 17, and `supabase db reset` loads an empty `migrations/` and `seed.sql` without errors;
- a guest sign-in works (anonymous sign-ins on);
- Supabase's docs say the CLI adds `public` and `storage` to the exposed schemas whatever `schemas` says. Check that, and that a request to a `public` table is refused (schema.sql revokes the grants; roadmap task M1.7 tests it). On the hosted project, set Settings, Data API, Exposed schemas to `api` only.

## Migrations

`migrations/` is the source of truth. The first file, `20261030154334_baseline.sql`, is the old reference DDL (`docs/architecture/schema.sql`, now a pointer) exactly as the pgTAP tests of M1.4 pin it, plus the extension lines. It is frozen: every later change is a new file from `supabase migration new <what_it_does>`, and a mistake is fixed forward. The pending changes of the data model's Pending note ship as their own migrations (M1.6 on). Squawk lints every migration a pull request adds; the baseline carries `-- squawk-ignore-file`.

What the baseline does about the items found while building the lite database:

- **Extensions.** `vector` and `pg_trgm` are created with schema `extensions`. `pgmq` and `pg_cron` are created only where `pg_available_extensions` lists them (Supabase and CI; the lite database has neither and stands in for the `pgmq` schema). `pg_graphql` is dropped, since GraphQL is off. `180-extensions.stack.test.sql` pins all five.
- **The `app_server` role.** The baseline creates it only if it is missing, so loading twice into one cluster works. The lite loader still drops it when no other lite database uses it.
- **`set role app_server`.** Since Postgres 16 the creating role gets ADMIN but not SET. `tests.act_as_server()` grants `postgres` SET when it lacks it and says so if that fails. If CI shows the grant failing, the baseline gets `grant app_server to postgres with inherit false, set true;` right after the role guard.
- **Test setup grants.** The test setup grants `app_server` usage on the `tests` and `extensions` schemas, so a test can call its helpers and pgTAP while acting as the server. That is test setup, not what the real server needs (M1.12).
- **Queue access.** The baseline's last section still lists a to-do (frozen, like the rest of that file). Migration `grant_app_server_queues` (M1.12a) did it: `app_server` can read, extend, archive and delete on the six queues it consumes, and can't send, purge, drop or create. `250-queue-grants.test.sql` pins it. Execute on pgmq's functions is open to everyone in the lite database (and on the stack until M1.7), so calling them as `app_server` passes either way; the test's D part checks the functions' access lists instead, which proves the grants on lite and on the stack.

## Tests

pgTAP tests live in `supabase/tests/database/`. The Supabase CLI's `supabase test db` runs the files of `supabase/tests` (`.sql` or `.pg`) with `pg_prove`, in alphabetical order, each in its own session; Supabase's docs put shared setup in a first file with a `000-` prefix and advise `begin` and `rollback` around every test. This repo follows that:

| File | Role |
| --- | --- |
| `000-helpers.sql` | The setup hook: installs pgTAP and the `tests` schema of helpers, outside any transaction so they stay for the later files. One check of its own |
| `NNN-topic.test.sql` | A test. Runs on the lite database and on the real stack. `begin; select plan(N); ...; select * from finish(); rollback;` |
| `NNN-topic.stack.test.sql` | A test that needs the real Supabase stack (Realtime delivery, real sign-in, the Data API). `supabase test db` and CI run it; `lite/test.sh` skips it |

Number files in steps of ten by topic (`010-smoke`, `020-helpers`, then one per area: access, lobby, game, letterboxd). Name the file after what must hold. A new test file needs no registration.

Run them:

```sh
supabase/lite/load.sh && supabase/lite/test.sh    # cloud sessions: see lite/README.md
supabase test db                                   # Mac and CI: the real stack
```

### The helpers

All in schema `tests`, defined in `000-helpers.sql`. Players have names (`'alice'`, `'p2'`) and `tests.uid('alice')` is always the same uuid, so tests keep no variables. Set players up first, as the superuser, then act.

| Function | Does |
| --- | --- |
| `tests.create_user(name, anonymous := true)` | An auth user and, through the sign-up trigger, its profile. Guests are anonymous users |
| `tests.create_player(name, country := 'FR', anonymous := true)` | The same, with the profile ready to play: display name = `name`, a country (added to `public.countries` if missing) |
| `tests.authenticate_as(name)` | Acts as that user: `set local role authenticated` plus `request.jwt.claims` with `sub`, `role`, `aud` and `is_anonymous`. Can switch from one player to another directly |
| `tests.authenticate_as_anon()` | Acts as a caller with the public key and no sign-in |
| `tests.clear_authentication()` | Back to the superuser with no token, to inspect tables |
| `tests.create_room(players := 2, mode := 'quick_match', country := 'FR', prefix := 'p')` | Creates players `p1` to `pN`, then `p1` creates a room and the others join it, all through `api.create_room` and `api.join_room`. Raises on any answer other than `ok`. Returns `{room_id, code, players, member_ids}` |
| `tests.room_id()`, `tests.room_code()` | The last room made by `create_room` in this transaction |
| `tests.member_id(name, room_id := tests.room_id())` | A player's seat id, for functions that take `p_member_id` |
| `tests.create_title(name)`, `tests.title_id(name)` | A made-up active movie (never TMDB data), and its id by name |
| `tests.create_provider(id, name, country := 'FR')` | A made-up service available in a country (use ids from 9001 up) |
| `tests.use_topic(topic)` | Sets the Realtime topic of the request. Call it right before every read or insert on `realtime.messages`, since `realtime.send` overwrites it |
| `tests.broadcasts(room_id, event)` | The payloads sent on `room:<id>` with that event. Check keys with `->>`, never whole payloads, and do not rely on the order within one transaction |
| `tests.create_catalog(count := 40, provider := 9001, country := 'FR')` | Made-up films `Catalog Film 001` and up (existing names skipped), each with a falling popularity, a subscription offer from the service in the country and a constant made-up vector, so `internal.deck_candidates` finds them. Returns the ids in number order |
| `tests.act_as_server()` | Acts as the `app_server` role with no token. On the real stack it grants `postgres` the right to `set role app_server` if it lacks it (rolled back with the test). `tests.clear_authentication()` ends it |
| `tests.queued(queue)` | The messages of a queue, oldest first, read from the queue table (nothing is consumed). Call it as the superuser and filter by `room_id` (or by `profile_id` or `linked_account_id`) |
| `tests.deal_game(players := 2, prefix := 'p', until := 'swiping', mode := 'quick_match')` | A room dealt through the real functions: `'lobby'` (seats with service 9001), `'dealing'` (the host has tapped start), `'swiping'` (the server dealt 25 catalog films: a shared opening of 10, then 15 ranked, ascending for odd seats and descending for even). Needs `create_catalog(25)` at least. Returns `{room_id, code, players, member_ids, title_ids, deal}`. `mode` is the room's game mode |
| `tests.vote_next(name, count, answer := 'nope')` | As that player, votes on the next `count` cards from `my_next_cards`. Raises on any answer but `ok`. Returns the last answer |
| `tests.film(n)` | The id of `Catalog Film <n>` (numbers from 1) |
| `tests.vote(name, film, answer := 'like')` | As that player, `api.cast_vote` on catalog film `film` in the last room. Returns the answer whatever its status (`closed`, `dropped`, `duplicate`), so a test can check it. Leaves the session as the superuser |
| `tests.upcoming(name, room_id := tests.room_id())` | The films still ahead of a seat (dealt, active card, no vote from it), in deck order |
| `tests.letterboxd_export(username := 'test_viewer')` | The payload of `internal.start_letterboxd_import` for a made-up export: Films 1 to 5 are created in the catalog (never Film 6), 6 films, 3 diary entries, consent `test-1`, share 0.95 (details in `000-helpers.sql`) |
| `tests.match_letterboxd_import(import_id)` | As the server, marks each pending row whose film is a `create_title` film as matched, the rest as unmatched. Returns the matched count, leaves the session as the superuser |
| `tests.connect_letterboxd(name, username := 'test_viewer', finish := true)` | Starts the player's import as the server, and unless `finish` is false matches and finishes it. Raises on any answer but `ok`. Returns `{linked_account_id, import_id, start, finish}` |
| `tests.linked_account_id(name)` | A player's Letterboxd link id, null if none |
| `tests.feed_item(film, watched_on, rating := null, rewatch := false)` | One item for `internal.apply_letterboxd_feed`, with the catalog film's TMDB id (null if the film is not in the catalog) |

After `authenticate_as`, call `tests.clear_authentication()` before creating more players or fixtures: setup writes need the superuser.

A rule test is then a few lines:

```sql
begin;
select plan(2);
select tests.create_room(3);                       -- p1 hosts, p2 and p3 are seated
select tests.authenticate_as('p2');
select is((select count(*) from api.room_seats), 3::bigint, 'p2 sees all three seats');
select tests.clear_authentication();
select is((select state::text from public.rooms where id = tests.room_id()), 'lobby', 'still in the lobby');
select * from finish();
rollback;
```

`000-helpers.sql` leaves the `tests` schema in the local database until the next `supabase db reset`. Never put it in a migration, and reset before `supabase db diff` or `db pull`, or the schema shows up as a difference.

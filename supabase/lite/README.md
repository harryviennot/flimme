# The lite database

A plain Postgres 16 with pgvector and pgTAP, loaded with the schema and the pgTAP tests, for cloud sessions (and any machine without Docker). It runs the same SQL and the same tests as the real Supabase stack, minus what only the real stack can do (see [What it doesn't cover](#what-it-doesnt-cover)).

## Why

Cloud containers can't run `supabase start`: it pulls about a dozen Docker images, and from a shared address Docker Hub answers "429 Too Many Requests" and Amazon's public registry "Data limit exceeded" (checked in [groundwork.md](../../docs/architecture/groundwork.md#cloud-sessions)). So a cloud session gets a lighter database: Supabase's `auth`, `realtime`, `pgmq` and `cron` schemas and its roles are replaced by small stand-ins ([standins.sql](standins.sql)), and nothing else changes. On a Mac and in CI, use the real stack (`supabase start`, `supabase test db`).

## Install (Ubuntu, as root, once per container)

Postgres 16 is already in the cloud image. Add pgvector, pgTAP and `pg_prove`, start the cluster, and give your login a superuser role:

```sh
apt-get update
apt-get install -y postgresql-16-pgvector postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
pg_ctlcluster 16 main start
su postgres -c "createuser --superuser $(whoami)"
```

On a machine where you are not root (a GitHub Actions runner, say), put `sudo` in front, start the cluster with `sudo systemctl start postgresql`, and create the role with `sudo -u postgres createuser --superuser "$USER"`.

Checked with Postgres 16.15, pgvector 0.6.0, pgTAP 1.3.2 and `pg_prove` 3.36 on Ubuntu 24.04. The `libtap-parser-sourcehandler-pgtap-perl` package is the one that provides `pg_prove`; without it `test.sh` falls back to plain `psql`.

How the scripts connect: through `psql` with the usual `PG*` environment variables, and nothing set means the local socket as your own OS user. Ubuntu's default `pg_hba.conf` allows that (peer authentication) once a superuser role with your login name exists, which is what the last command does. The role must be a superuser: loading creates roles and the `vector` extension. To use TCP instead, export `PGHOST=localhost PGUSER=postgres PGPASSWORD=...` before running the scripts.

## Use

```sh
supabase/lite/load.sh    # drop and recreate the database, load everything (about a second)
supabase/lite/test.sh    # run the pgTAP tests; non-zero exit on failure
```

- **`load.sh`** drops and recreates `movie_swipe_lite` (set `LITE_DB` for another name), then loads, with `ON_ERROR_STOP=1`:
  1. [standins.sql](standins.sql),
  2. every `supabase/migrations/*.sql` in order (it stops with "no migrations in supabase/migrations" when there are none),
  3. [supabase/seed.sql](../seed.sql).

  It ends with a one-line summary, for example `tables public=43 rec=4; views public=1 api=17; functions api=18 internal=27 rec=0; queues=7`, so a change that adds or loses an object shows at a glance.
- **`test.sh`** runs `supabase/tests/**/*.sql` in alphabetical order with `pg_prove`, the same files and order as `supabase test db`, except the stack-only ones (`*.stack.test.sql`), which it lists and skips. Pass file paths to run only those: `supabase/lite/test.sh supabase/tests/database/010-smoke.test.sql`.
- Reload before testing after any change to the schema, a migration or a stand-in. Tests roll back their own changes, so repeated `test.sh` runs need no reload.
- Several lite databases can share a cluster, one per session: set `LITE_DB` (for example `LITE_DB=m14_part2`) for both `load.sh` and `test.sh`. The baseline migration creates the role `app_server` only if it's missing, and `load.sh` keeps that role while another database still uses it.

Tests, their helpers (`tests.create_room(3)`, `tests.authenticate_as('p2')`, ...) and the naming rules are described in [supabase/README.md](../README.md#tests).

## What the stand-ins copy

Only what the schema and the tests touch, behaving as Supabase does for those parts:

| Stand-in | What the migrations and the tests use |
| --- | --- |
| Roles `anon`, `authenticated`, `service_role` | `NOLOGIN NOINHERIT`, `service_role` bypasses row-level security; the `public` schema's default privileges grant the three roles everything, as in a Supabase project, so the baseline's revokes are tested for real |
| `extensions` schema | `vector`, `pg_trgm` and `pgcrypto` live there, and it is on the database's default `search_path`, as in Supabase |
| `auth.users`, `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` | The sign-up trigger, the foreign key from `profiles`, and the functions that read `request.jwt.claims` |
| `realtime.messages`, `realtime.topic()`, `realtime.send()` | The two row-level security policies on `realtime.messages`, and `internal.broadcast_room`. `send` stores the row, so a test can check what the database broadcast |
| `pgmq.create`, `send`, `read`, `read_with_poll`, `delete` and `archive` (one id or an array), `set_vt`, `purge_queue`, `drop_queue`, tables `q_<name>` and `a_<name>` | `internal.enqueue`, the seven queues, and the server's queue loop later |
| `cron.job`, `cron.schedule`, `cron.unschedule` | Nothing yet; later migrations can schedule jobs. Jobs are recorded, never run |

## What it doesn't cover

Verify these on the Mac (`supabase start`, `supabase test db`) or in CI:

- **Realtime delivery**: that a broadcast reaches a phone, and that Realtime really evaluates the policies the way the tests simulate by setting `realtime.topic`.
- **Real sign-in**: a real anonymous sign-in, the `is_anonymous` claim of a real token, token expiry, the Data API's rate limits. The tests fake the claims.
- **The Data API**: PostgREST's exposed-schema setting, its role switching, `max_rows`. The tests switch roles themselves with `set local role`.
- **The real pgmq**: the extension has more functions, columns (`headers`) and grants; `app_server`'s access to the queues, which the baseline still lists as a to-do, is not tested.
- **pg_cron** running jobs, **Postgres 17** (new projects get 17; this runs on 16), Supabase's own extension versions, Storage, Edge Functions, the pooler, `supabase db reset` and the migration runner itself.
- **Performance**: there is no catalog data until the seed (M1.14) and no realistic one ever, so timing and index choices need the real thing.

When the real stack disagrees with a stand-in, fix the stand-in, and say so in its comment.

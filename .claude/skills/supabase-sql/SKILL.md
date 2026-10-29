---
name: supabase-sql
description: Conventions for SQL in this repo (Supabase migrations, api and internal functions, row-level security, pgTAP tests, the lite database). Use whenever writing, changing, testing or reviewing anything under supabase/ or any database function, table, policy or migration.
---

# SQL here

The database decides the game. The app only reaches the `api` schema; the server writes through `internal.*` functions. Background: docs/architecture/data-model.md (read by section), and the conventions at the top of docs/architecture/schema.sql (lines 1 to 25).

## Where things are

- `supabase/migrations/`: the source of truth once M1.5 lands. Until then the schema is `docs/architecture/schema.sql`: grep it, never read it whole (124 KB, about 2,800 lines).
- `supabase/tests/database/`: pgTAP tests, with helpers for users, acting as a seat and rooms (see supabase/CLAUDE.md for their names).
- `supabase/lite/`: plain Postgres 16 with stand-ins for Supabase's `auth`, `realtime` and `pgmq`, for cloud sessions.
- `supabase/seed.sql`: synthetic data only. **No TMDB data in git, ever** (TMDB's 6-month rule).

## Migrations

- New file each change: `supabase migration new <what_it_does>`. Never edit one that's on main.
- **Expand, then contract.** Add tables, columns with defaults, functions, `_v2` versions. Dropping or renaming waits for a separate contract release once no shipped app or server uses the old thing.
- **`create or replace` collisions:** if your migration replaces a function another open branch also changes, the later merge silently undoes the earlier one. The brief lists the functions touched; replace the whole function from main's latest version.
- No down migrations: fix forward.
- Squawk lints new migrations in CI (locks, unsafe changes).

## Functions

- `security definer` with `set search_path = ''`, every name schema-qualified (`public.rooms`, `internal.my_profile_id()`).
- **Expected outcomes are answers:** `return jsonb_build_object('status', 'full')`. The app shows a message per status. Only real errors raise, and access errors use `errcode = '42501'`.
- **The room lock:** anything that changes a room's game state starts with `select * into v_room from public.rooms where id = p_room_id for no key update;` so votes, the finale and the sweeper never race.
- The caller is `internal.my_profile_id()` (or `internal.my_profile_ids()` for seats a player controls); never trust a profile id passed in.
- Realtime goes through `internal.broadcast_room(room_id, event, payload)`. Event names and payloads: the `realtime-contract` skill.
- Every write function goes through `internal.rate_limit` (per profile and per IP) once M1.9 adds it.
- Settings and ranges are validated in the function (the app is never trusted), e.g. `api.update_room_settings` (M1.10).
- An incompatible change to an `api` function or view ships as `<name>_v2` next to it. Adding an optional argument or a column to a view is compatible.

## Access

- Row-level security on every table; `api` views run with the caller's rights.
- Grants are explicit; default privileges are revoked (M1.7). The CI check fails on a table without row-level security or a function open to phones by mistake.
- Players who left or were removed read nothing of the room (`room_members.removed_at`, M1.8).
- Nobody ever reads who noped a film, and swipes never reach other phones during a game: counts only.

## Tests (pgTAP)

- **Every rule the brief lists has a test**, named after the rule.
- Use the helpers to make users and rooms and to act as a seat; a rule test should be a few lines.
- Test the answers (`status`), the state left behind, and what each role can and can't read.
- Multi-player rules: several seats in one test, acting as each in turn.
- Files that need the real stack (Realtime delivery, real sign-in) end in `.stack.test.sql`; the lite runner skips them.

## Running

- Mac, CI: `supabase start` once, then `supabase db reset` and `supabase test db` (`mise run db:test`).
- Cloud sessions: `mise run db:lite` then `mise run db:lite:test`.
- After a schema change: `mise run typegen` and commit `packages/contract/src/database.types.ts` (CI compares it).

# supabase/

The database decides the game. Load the `supabase-sql` skill before changing anything here (and `realtime-contract` for broadcasts).

- **Until M1.5** there are no migrations: the schema is `docs/architecture/schema.sql`. Grep it for the function or table you need; never read it whole.
- **Tests** are pgTAP files in `tests/database/`: `000-helpers.sql` installs the helpers, then `NNN-topic.test.sql` files, each `begin; select plan(N); ... select * from finish(); rollback;`. Files that need the real stack end in `.stack.test.sql`.
- **Helpers** (`tests` schema): `tests.create_player(name)` makes a guest with a profile, `tests.authenticate_as(name)` acts as them (`tests.authenticate_as_anon()`, `tests.clear_authentication()`), `tests.create_room(...)` seats players in a room, then `tests.room_id()`, `tests.room_code()`, `tests.member_id(name)`; fixtures `tests.create_title`, `tests.create_provider`, `tests.use_topic`, `tests.broadcasts`; server and deck fixtures `tests.create_catalog`, `tests.act_as_server`, `tests.queued`, `tests.deal_game`, `tests.vote_next`; game fixtures `tests.film`, `tests.vote`, `tests.upcoming`. Read `000-helpers.sql` for the exact arguments.
- **Run:** on the Mac or in CI, `supabase start` once, then `supabase db reset` and `supabase test db`. In a cloud session, `mise run db:lite` then `mise run db:lite:test` (setup in `lite/README.md`).
- Known issues for M1.5 (the baseline migration) are listed in `README.md`.

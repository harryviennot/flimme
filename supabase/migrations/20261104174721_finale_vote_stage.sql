-- M6.4 part 1: the vocabulary for the new finale (game-modes.md#changes-to-the-data-model).
-- One 60-second round has the stage `vote` for both kinds; `veto` and `rank` stay in the type, unused.
-- Why a finale started goes in rooms.finale_reason. An added enum value can't be used in its own
-- transaction, so the functions that use it are in the next migration.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter type public.round_stage add value if not exists 'vote' before 'closed';

create type public.finale_reason as enum ('cards', 'time', 'all_done', 'vote_now', 'shortlist_full');

alter table public.rooms add column finale_reason public.finale_reason;

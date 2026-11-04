-- M6.2: the answer "Watch it again tonight? Yes" (game-modes.md#changes-to-the-data-model).
-- A new enum value can't be used in the transaction that adds it, so it has its own file;
-- the next migration uses it.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter type public.vote_answer add value if not exists 'seen_rewatch' after 'seen';

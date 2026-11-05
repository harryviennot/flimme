-- M6.41: the solo source for user_titles (solo-and-my-films.md#10-storage-privacy-retention-export-and-deletion).
-- The enum value alone, so the next file can use it.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter type public.title_fact_source add value if not exists 'solo' after 'app';

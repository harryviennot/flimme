-- M8.5: deleting an account also clears what names it in the rate limits, and scrubs the names of
-- seats the player controlled (security.md#account-deletion-and-data-export).
--
-- Replaces internal.scrub_deleted_profile whole. The version replaced is the baseline's
-- (20261030154334_baseline.sql): it only blanked the name and avatar of the player's own seats.
-- Now it also:
--   * blanks the seats the player controlled (a name typed by the deleted player), before the
--     foreign key sets controlled_by to null;
--   * deletes public.rate_limits rows whose key ends in ':p:<profile id>' (every action's
--     per-player counter). IP keys are hashed and are not the player's id: they stay.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function internal.scrub_deleted_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_members set display_name = '', avatar_key = 'default'
  where profile_id = old.id or controlled_by = old.id;

  delete from public.rate_limits where key like '%:p:' || old.id::text;

  return old;
end
$$;

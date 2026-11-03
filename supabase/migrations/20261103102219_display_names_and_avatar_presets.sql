-- squawk-ignore-file prefer-robust-stmts
-- M4.3: display names are normalised and filtered, avatars are presets only
-- (security.md#keeping-kids-safe-on-screen and #the-database-gaps-found, gap 4).
-- api.update_profile answers invalid_name, name_not_allowed, unknown_avatar, or ok with
-- the saved values. Phones get nothing new: the table and the helpers have no grants.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ---------------------------------------------------------------------------
-- Avatars: six colours plus the default every guest starts with. Anything else
-- saved so far goes back to the default before the constraint is added.
-- ---------------------------------------------------------------------------

update public.profiles
set avatar_key = 'default'
where avatar_key not in ('default', 'blue', 'green', 'gold', 'red', 'violet', 'teal');

alter table public.profiles
  add constraint profiles_avatar_key_preset
  check (avatar_key in ('default', 'blue', 'green', 'gold', 'red', 'violet', 'teal')) not valid;
alter table public.profiles validate constraint profiles_avatar_key_preset;

-- ---------------------------------------------------------------------------
-- The blocklist. Entries are stored already folded: lowercase letters a to z,
-- no accents, no leet digits. Nobody outside the database reads it.
-- ---------------------------------------------------------------------------

create table internal.name_blocklist (
  term text primary key check (term ~ '^[a-z]+$'),
  language text not null check (language in ('en', 'fr', 'any'))
);
alter table internal.name_blocklist enable row level security;
revoke all on internal.name_blocklist from public, anon, authenticated;

-- Normalises a display name: NFKC, whitespace to a space, invisible and direction
-- characters removed, stray combining marks dropped, space runs collapsed, trimmed.
-- The ranges are written as \u escapes in the pattern so no locale is involved.
create function internal.normalise_display_name(p text) returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            normalize(p, nfkc),
            '[\t\n\v\f\r\u00A0\u1680\u2000-\u200A\u2028\u2029\u3000]', ' ', 'g'),
          '[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u2800\u3164\uFEFF\uFFA0]', '', 'g'),
        ' +', ' ', 'g')),
    '(^|[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F])[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]+',
    '\1', 'g')
$$;

-- Says whether a (normalised) name is on the list: folded, any word equals an entry,
-- or the whole name without separators does. Never a substring.
create function internal.is_blocked_name(p text) returns boolean
language sql stable set search_path = ''
as $$
  with folded as (
    select translate(
      lower(regexp_replace(normalize(p, nfd), '[\u0300-\u036F]', '', 'g')),
      '013457@$', 'oieastas') as f
  )
  select exists (
    select 1 from folded, internal.name_blocklist b
    where b.term = regexp_replace(f, '[^a-z0-9]', '', 'g')
       or b.term = any (regexp_split_to_array(f, '[^a-z0-9]+'))
  )
$$;

revoke execute on function internal.normalise_display_name(text) from public, anon, authenticated;
revoke execute on function internal.is_blocked_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The list. Reviewed by Harry in the pull request.
-- ---------------------------------------------------------------------------

insert into internal.name_blocklist (term, language) values
  -- impersonation
  ('flimme', 'any'), ('admin', 'any'), ('administrateur', 'fr'), ('moderateur', 'fr'),
  ('moderator', 'en'), ('support', 'any'), ('staff', 'any'), ('official', 'en'),
  ('officiel', 'fr'), ('system', 'en'), ('systeme', 'fr'),
  -- English slurs
  ('nigger', 'en'), ('niggers', 'en'), ('nigga', 'en'), ('niggas', 'en'), ('negro', 'en'),
  ('faggot', 'en'), ('faggots', 'en'), ('fag', 'en'), ('fags', 'en'), ('dyke', 'en'),
  ('tranny', 'en'), ('shemale', 'en'), ('retard', 'en'), ('retarded', 'en'),
  ('spic', 'en'), ('chink', 'en'), ('gook', 'en'), ('kike', 'en'), ('wetback', 'en'),
  ('beaner', 'en'), ('coon', 'en'), ('paki', 'en'), ('raghead', 'en'), ('towelhead', 'en'),
  ('sandnigger', 'en'), ('darkie', 'en'), ('gypo', 'en'),
  ('zipperhead', 'en'), ('jigaboo', 'en'), ('porchmonkey', 'en'),
  -- English insults and sexual terms
  ('cunt', 'en'), ('cunts', 'en'), ('twat', 'en'), ('whore', 'en'), ('whores', 'en'),
  ('slut', 'en'), ('sluts', 'en'), ('slutty', 'en'), ('bitch', 'en'), ('bitches', 'en'),
  ('dick', 'en'), ('dicks', 'en'), ('dickhead', 'en'), ('cock', 'en'), ('cocks', 'en'),
  ('cocksucker', 'en'), ('pussy', 'en'), ('pussies', 'en'), ('blowjob', 'en'),
  ('handjob', 'en'), ('rimjob', 'en'), ('cum', 'en'), ('cumshot', 'en'), ('jizz', 'en'),
  ('wank', 'en'), ('wanker', 'en'), ('tits', 'en'), ('titties', 'en'), ('asshole', 'en'),
  ('arsehole', 'en'), ('ass', 'en'), ('anal', 'en'), ('anus', 'en'), ('dildo', 'en'),
  ('orgasm', 'en'), ('bukkake', 'en'), ('fuck', 'en'), ('fucker', 'en'), ('fucking', 'en'),
  ('fuckme', 'en'), ('motherfucker', 'en'), ('shit', 'en'), ('shithead', 'en'),
  ('bollocks', 'en'), ('thot', 'en'), ('cuck', 'en'), ('milf', 'en'), ('incest', 'en'),
  ('rape', 'en'), ('raped', 'en'), ('rapist', 'en'), ('molest', 'en'), ('molester', 'en'),
  ('pedo', 'en'), ('pedophile', 'en'), ('paedo', 'en'), ('paedophile', 'en'),
  ('sex', 'en'), ('horny', 'en'), ('nude', 'en'), ('nudes', 'en'), ('erotic', 'en'),
  ('hentai', 'en'), ('gangbang', 'en'), ('threesome', 'en'), ('creampie', 'en'),
  ('whitepower', 'en'), ('heilhitler', 'en'), ('suicide', 'en'), ('killyourself', 'en'),
  -- French slurs
  ('negre', 'fr'), ('negresse', 'fr'), ('bamboula', 'fr'), ('bougnoule', 'fr'),
  ('bougnoul', 'fr'), ('bicot', 'fr'), ('raton', 'fr'), ('youpin', 'fr'), ('youtre', 'fr'),
  ('chinetoque', 'fr'), ('niakoue', 'fr'), ('sidatique', 'fr'), ('pede', 'fr'),
  ('pedale', 'fr'), ('tapette', 'fr'), ('tafiole', 'fr'), ('tarlouze', 'fr'),
  ('gouine', 'fr'), ('fiotte', 'fr'), ('mongol', 'fr'), ('attarde', 'fr'),
  -- French insults and sexual terms
  ('pute', 'fr'), ('putes', 'fr'), ('putain', 'fr'), ('salope', 'fr'), ('salopes', 'fr'),
  ('salopard', 'fr'), ('connard', 'fr'), ('connards', 'fr'), ('connasse', 'fr'),
  ('encule', 'fr'), ('encules', 'fr'), ('enculer', 'fr'), ('enculeur', 'fr'),
  ('enfoire', 'fr'), ('petasse', 'fr'), ('pouffiasse', 'fr'), ('garce', 'fr'),
  ('catin', 'fr'), ('bite', 'fr'), ('couille', 'fr'), ('couilles', 'fr'),
  ('chatte', 'fr'), ('nichons', 'fr'), ('nique', 'fr'), ('niquer', 'fr'), ('ntm', 'fr'),
  ('fdp', 'fr'), ('merde', 'fr'), ('branleur', 'fr'), ('branlette', 'fr'),
  ('branler', 'fr'), ('baise', 'fr'), ('baiseur', 'fr'), ('zob', 'fr'), ('sperme', 'fr'),
  ('sodomie', 'fr'), ('sodomiser', 'fr'), ('foutre', 'fr'), ('suceuse', 'fr'),
  ('fellation', 'fr'), ('cunnilingus', 'fr'), ('inceste', 'fr'),
  ('viol', 'fr'), ('violeur', 'fr'), ('violer', 'fr'), ('pedophilie', 'fr'),
  ('pedocriminel', 'fr'), ('sexe', 'fr'), ('sexuel', 'fr'), ('sexto', 'fr'),
  -- both languages
  ('nazi', 'any'), ('nazis', 'any'), ('hitler', 'any'), ('kkk', 'any'), ('porn', 'any'),
  ('porno', 'any'), ('xxx', 'any'), ('pornhub', 'any'), ('onlyfans', 'any');

-- ---------------------------------------------------------------------------
-- api.update_profile: normalise, check the length, the blocklist, the avatar;
-- a refused call saves nothing. null keeps the current value, unchecked.
-- ---------------------------------------------------------------------------

create or replace function api.update_profile(
  p_display_name text default null,
  p_avatar_key text default null,
  p_country char(2) default null,
  p_language text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_saved_name text;
  v_saved_avatar text;
begin
  if p_display_name is not null then
    v_name := internal.normalise_display_name(p_display_name);
    if char_length(v_name) not between 1 and 24 then
      return jsonb_build_object('status', 'invalid_name');
    end if;
    if internal.is_blocked_name(v_name) then
      return jsonb_build_object('status', 'name_not_allowed');
    end if;
  end if;
  if p_avatar_key is not null
     and p_avatar_key not in ('blue', 'green', 'gold', 'red', 'violet', 'teal') then
    return jsonb_build_object('status', 'unknown_avatar');
  end if;
  update public.profiles
  set display_name = coalesce(v_name, display_name),
      avatar_key = coalesce(p_avatar_key, avatar_key),
      country = coalesce(p_country, country),
      language = coalesce(p_language, language),
      updated_at = now()
  where auth_user_id = auth.uid()
  returning display_name, avatar_key into v_saved_name, v_saved_avatar;
  if not found then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  return jsonb_build_object('status', 'ok', 'display_name', v_saved_name, 'avatar_key', v_saved_avatar);
end
$$;

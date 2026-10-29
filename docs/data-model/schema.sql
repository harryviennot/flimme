-- MovieMatch data model: reference DDL for the first release.
--
-- A draft to review, not a migration yet. README.md in this folder explains
-- every table and how they interact. Target: Supabase Postgres with pgvector
-- and pg_trgm installed in the extensions schema. Tables the first release
-- does not need are described in the README under "Later" and are not here.
--
-- Conventions
--   * Every client write goes through a function below. Clients only read,
--     except their own profile fields and services.
--   * Functions are security definer with an empty search_path, so every
--     name is schema-qualified.
--   * Catalog ids are TMDB ids, except titles, which use their own id because
--     TMDB reuses the same number for a movie and a TV show.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;


-- =========================================================================
-- Enums. Stable sets only; anything tuned or added often is a table.
-- =========================================================================

create type public.media_type as enum ('movie', 'tv');
create type public.offer_kind as enum ('subscription', 'free', 'ads', 'rent', 'buy');
create type public.credit_role as enum ('director', 'writer', 'cast');

create type public.title_fact_source as enum ('letterboxd', 'calibration', 'app');
create type public.reaction as enum ('love', 'fine', 'nope');
create type public.linked_provider as enum ('letterboxd');
create type public.import_kind as enum ('rss', 'export');
create type public.import_status as enum ('pending', 'matching', 'done', 'failed');
create type public.import_row_status as enum ('pending', 'matched', 'unmatched', 'ignored');
create type public.match_method as enum ('rss', 'search', 'manual');
create type public.consent_kind as enum ('letterboxd_import', 'analytics');

create type public.room_state as enum ('lobby', 'swiping', 'finale', 'done', 'abandoned');
create type public.service_rule as enum ('any_member', 'every_member');
create type public.seen_rule as enum ('hide_seen', 'allow_rewatch', 'show_all');
create type public.quality_preset as enum ('standard', 'hidden_gems', 'guilty_pleasures');
create type public.reveal_mode as enum ('party', 'blind');
create type public.member_role as enum ('host', 'guest');
create type public.card_source as enum ('ranked', 'wildcard');
create type public.card_state as enum ('active', 'dropped', 'matched', 'finalist');
create type public.deck_source as enum ('opening', 'ranked', 'propagated', 'wildcard');
create type public.vote_answer as enum ('nope', 'like', 'super_like', 'seen');
create type public.swipe_action as enum ('vote', 'undo');
create type public.match_kind as enum ('unanimous', 'majority', 'finale');
create type public.match_rule_kind as enum ('all_like', 'share_like');
create type public.finale_kind as enum ('final_cut', 'ranked_vote');
create type public.round_stage as enum ('veto', 'rank', 'closed');
create type public.ballot_kind as enum ('veto', 'pass', 'rank');
create type public.watched_answer as enum ('yes', 'no', 'something_else');


-- =========================================================================
-- 1. Reference data
-- =========================================================================

create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  default_language text not null default 'en',
  catalog_enabled boolean not null default false   -- availability is ingested for this country
);

create table public.genres (
  id integer primary key,                          -- TMDB genre id
  slug text not null unique,
  names jsonb not null,                            -- {"en": "Comedy", "fr": "Comédie"}
  media_types public.media_type[] not null default '{movie}'
);

create table public.keywords (
  id integer primary key,                          -- TMDB keyword id
  name text not null
);

create table public.people (
  id integer primary key,                          -- TMDB person id
  name text not null,
  profile_path text,
  popularity real,
  updated_at timestamptz not null default now()
);

create table public.providers (
  id integer primary key,                          -- TMDB watch provider id
  name text not null,
  logo_path text,
  streaming_availability_id text,                  -- service id for winner deep links
  updated_at timestamptz not null default now()
);

create table public.provider_regions (
  provider_id integer not null references public.providers on delete cascade,
  country char(2) not null references public.countries,
  display_priority smallint not null default 100,
  primary key (provider_id, country)
);
create index provider_regions_country_idx on public.provider_regions (country, display_priority);

create table public.certification_ages (
  country char(2) not null references public.countries,
  certification text not null,                     -- 'PG-13', '12', 'U'
  min_age smallint not null check (min_age between 0 and 21),
  primary key (country, certification)
);

create table public.moods (
  slug text primary key,                           -- 'cozy', 'mind_bending', 'laugh', 'scary', 'background'
  names jsonb not null,
  include_genre_ids integer[] not null default '{}',
  exclude_genre_ids integer[] not null default '{}',
  keyword_ids integer[] not null default '{}',
  runtime_max smallint,
  sort smallint not null default 0,
  is_active boolean not null default true
);


-- =========================================================================
-- 2. Catalog (written by ingest jobs only)
-- =========================================================================

create table public.titles (
  id bigint generated always as identity primary key,
  media_type public.media_type not null default 'movie',
  tmdb_id integer not null,
  imdb_id text,
  original_title text not null,
  original_language text,
  release_date date,
  release_year smallint generated always as (extract(year from release_date)::smallint) stored,
  runtime_min smallint check (runtime_min > 0),
  genre_ids integer[] not null default '{}',
  keyword_ids integer[] not null default '{}',
  collection_id integer,                           -- TMDB collection, used to avoid five sequels in a row
  popularity real not null default 0,
  vote_average real,
  vote_count integer not null default 0,
  quality_score real,                              -- vote average weighted by vote count, 0 to 10
  poster_path text,
  poster_placeholder text,                         -- blurhash or thumbhash
  backdrop_path text,
  trailer_key text,                                -- YouTube key
  is_adult boolean not null default false,
  is_active boolean not null default true,         -- deactivate, never delete: votes point here
  refresh_tier smallint not null default 1 check (refresh_tier in (1, 2)),  -- 1 daily, 2 weekly
  tmdb_changed_at timestamptz,
  refreshed_at timestamptz,
  unique (media_type, tmdb_id)
);
create index titles_genre_ids_idx on public.titles using gin (genre_ids);
create index titles_deck_idx on public.titles (media_type, quality_score desc)
  where is_active and not is_adult;
create index titles_refresh_idx on public.titles (refresh_tier, refreshed_at);

create table public.title_translations (
  title_id bigint not null references public.titles on delete cascade,
  language text not null check (language ~ '^[a-z]{2}$'),
  title text not null,
  overview text,
  tagline text,
  poster_path text,                                -- localized poster when TMDB has one
  primary key (title_id, language)
);
create index title_translations_title_trgm on public.title_translations
  using gin (title extensions.gin_trgm_ops);

create table public.title_credits (
  title_id bigint not null references public.titles on delete cascade,
  person_id integer not null references public.people,
  role public.credit_role not null,
  character_name text,
  ord smallint not null default 0,
  primary key (title_id, person_id, role)
);
create index title_credits_person_idx on public.title_credits (person_id, role);

create table public.title_certifications (
  title_id bigint not null references public.titles on delete cascade,
  country char(2) not null references public.countries,
  certification text not null,
  min_age smallint,                                -- from certification_ages at ingest, null if unknown
  primary key (title_id, country)
);

create table public.title_availability (
  title_id bigint not null references public.titles on delete cascade,
  country char(2) not null references public.countries,
  provider_id integer not null references public.providers,
  kind public.offer_kind not null,
  checked_at timestamptz not null default now(),
  primary key (title_id, country, provider_id, kind)
);
create index title_availability_deck_idx on public.title_availability (country, provider_id, kind, title_id);

create table public.title_watch_links (
  title_id bigint not null references public.titles on delete cascade,
  country char(2) not null references public.countries,
  tmdb_link text not null,                         -- TMDB watch page powered by JustWatch
  checked_at timestamptz not null default now(),
  primary key (title_id, country)
);

create table public.title_deep_links (
  title_id bigint not null references public.titles on delete cascade,
  country char(2) not null references public.countries,
  provider_id integer not null references public.providers,
  kind public.offer_kind not null,
  link text not null,                              -- "Open in Netflix", from Streaming Availability
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (title_id, country, provider_id, kind)
);

create table public.title_vectors (
  title_id bigint primary key references public.titles on delete cascade,
  embedding extensions.vector(384) not null,
  model text not null default 'gte-small',
  source_hash text not null,                       -- hash of the embedded text, re-embed when it changes
  embedded_at timestamptz not null default now()
);
create index title_vectors_hnsw on public.title_vectors
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.calibration_titles (
  title_id bigint primary key references public.titles,
  axis text not null,                              -- 'horror', 'romcom', 'arthouse', 'blockbuster', 'animated'
  sort smallint not null default 0,
  is_active boolean not null default true
);

create table public.ingest_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('backfill', 'providers_daily', 'long_tail_weekly', 'changes_daily', 'embeddings')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  titles_touched integer not null default 0,
  errors integer not null default 0,
  cursor jsonb,
  note text
);


-- =========================================================================
-- 3. Players
-- =========================================================================

-- A profile is a player. At launch every profile belongs to one auth user
-- (a guest or a signed-in account) and profiles.id = auth.users.id.
-- Kid profiles later are managed profiles: no auth user, managed_by a parent.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users on delete cascade,
  managed_by uuid references public.profiles on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 24),
  avatar_key text not null default 'default',      -- preset avatar, never a photo
  country char(2) references public.countries,
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  check ((auth_user_id is null) <> (managed_by is null))
);
create index profiles_managed_by_idx on public.profiles (managed_by) where managed_by is not null;

create table public.profile_providers (
  profile_id uuid not null references public.profiles on delete cascade,
  provider_id integer not null references public.providers,
  created_at timestamptz not null default now(),
  primary key (profile_id, provider_id)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  kind public.consent_kind not null,
  version text not null,                           -- wording version the player agreed to
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index consents_active_idx on public.consents (profile_id, kind) where revoked_at is null;


-- =========================================================================
-- 4. Film history and taste
-- =========================================================================

create table public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  provider public.linked_provider not null,
  username text not null,
  consent_id uuid not null references public.consents,
  feed_etag text,
  feed_last_modified text,
  last_synced_at timestamptz,
  next_sync_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  unique (profile_id, provider)
);
create index linked_accounts_sync_idx on public.linked_accounts (next_sync_after);

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  linked_account_id uuid not null references public.linked_accounts on delete cascade,
  kind public.import_kind not null,
  status public.import_status not null default 'pending',
  films_total integer not null default 0,
  films_matched integer not null default 0,
  films_unmatched integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);
create index imports_account_idx on public.imports (linked_account_id, started_at desc);

-- One row per film from a Letterboxd export, already merged across the CSVs
-- on the phone. Matched rows are applied to user_titles and deleted; unmatched
-- rows stay for the manual fix screen.
create table public.import_rows (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports on delete cascade,
  film_name text not null,
  film_year smallint,
  letterboxd_uri text,
  watched boolean not null default false,
  rating numeric(2,1),
  liked boolean not null default false,
  on_watchlist boolean not null default false,
  last_watched_on date,
  rewatch_count smallint not null default 0,
  status public.import_row_status not null default 'pending',
  title_id bigint references public.titles
);
create index import_rows_import_idx on public.import_rows (import_id, status);

-- Shared by all players: each Letterboxd film is resolved to TMDB once.
create table public.letterboxd_film_map (
  letterboxd_key text primary key,                 -- normalized film slug or boxd.it id
  title_id bigint not null references public.titles,
  matched_by public.match_method not null,
  confidence real not null default 1,
  created_at timestamptz not null default now()
);

-- What a player has done with a film, one row per source. Disconnecting
-- Letterboxd deletes the linked account, which cascades to its rows here.
create table public.user_titles (
  profile_id uuid not null references public.profiles on delete cascade,
  title_id bigint not null references public.titles,
  source public.title_fact_source not null,
  linked_account_id uuid references public.linked_accounts on delete cascade,
  seen boolean not null default false,
  rating numeric(2,1) check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  liked boolean not null default false,
  on_watchlist boolean not null default false,
  reaction public.reaction,                        -- calibration answer or after-game reaction
  rewatch_count smallint not null default 0,
  last_watched_on date,
  updated_at timestamptz not null default now(),
  primary key (profile_id, title_id, source),
  check ((source = 'letterboxd') = (linked_account_id is not null))
);

-- One row per player and film, merging every source.
create view public.user_title_facts with (security_invoker = true) as
select
  ut.profile_id,
  ut.title_id,
  bool_or(ut.seen) as seen,
  max(ut.rating) filter (where ut.source = 'letterboxd') as letterboxd_rating,
  bool_or(ut.liked) as liked,
  bool_or(ut.on_watchlist) as on_watchlist,
  (array_agg(ut.reaction order by ut.updated_at desc) filter (where ut.reaction is not null))[1] as reaction,
  max(ut.last_watched_on) as last_watched_on
from public.user_titles ut
group by ut.profile_id, ut.title_id;

create table public.taste_profiles (
  profile_id uuid primary key references public.profiles on delete cascade,
  embedding extensions.vector(384),
  affinities jsonb not null default '{}',          -- {"genres": {"27": -0.8}, "decades": {"1990": 0.4}, "directors": {}, "languages": {}}
  signal_count integer not null default 0,
  model text not null default 'gte-small',
  computed_at timestamptz not null default now()
);


-- =========================================================================
-- 5. Rooms and the game
-- =========================================================================

create table public.game_modes (
  slug text primary key,                           -- 'quick_match', 'final_cut', 'date_night'
  min_players smallint not null default 2,
  max_players smallint not null default 10,
  ends_on_first_match boolean not null,
  defaults jsonb not null default '{}',            -- room setting defaults for this mode
  is_active boolean not null default true,
  sort smallint not null default 0,
  check (min_players <= max_players)
);

create table public.match_rules (
  id smallint generated always as identity primary key,
  mode text not null references public.game_modes,
  min_players smallint not null,
  max_players smallint not null,
  instant_rule public.match_rule_kind not null,
  share_threshold numeric(3,2),                    -- for share_like, e.g. 0.70
  finale_kind public.finale_kind not null,
  finale_after_cards smallint,                     -- per present player
  finale_after_seconds integer,
  finale_size smallint not null default 4,
  check (min_players <= max_players),
  check (instant_rule <> 'share_like' or share_threshold is not null)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null check (code ~ '^[0-9]{6}$'),
  host_id uuid references public.profiles on delete set null,
  mode text not null references public.game_modes,
  state public.room_state not null default 'lobby',
  country char(2) not null references public.countries,
  -- settings, edited by the host in the lobby
  service_rule public.service_rule not null default 'any_member',
  offer_kinds public.offer_kind[] not null default '{subscription,free,ads}',
  runtime_max smallint,
  seen_rule public.seen_rule not null default 'hide_seen',
  quality public.quality_preset not null default 'standard',
  max_age smallint,
  reveal public.reveal_mode not null default 'party',
  max_players smallint not null default 10,
  -- derived
  provider_ids integer[] not null default '{}',    -- union or intersection of members' services
  rule jsonb,                                      -- match_rules rows for this mode, frozen at start
  seed integer not null default floor(random() * 2147483647)::integer,
  stats jsonb,                                     -- written when the room ends: duration, swipes, players
  -- lifecycle
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finale_at timestamptz,
  decided_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default now() + interval '3 hours'
);
create unique index rooms_open_code_idx on public.rooms (code) where state in ('lobby', 'swiping', 'finale');
create index rooms_host_started_idx on public.rooms (host_id, started_at);
create index rooms_sweep_idx on public.rooms (expires_at) where state in ('lobby', 'swiping', 'finale');

-- The room's live taste, updated by the deck engine between refills.
create table public.room_models (
  room_id uuid primary key references public.rooms on delete cascade,
  embedding extensions.vector(384),
  feature_weights jsonb not null default '{}',
  dropped_genre_ids integer[] not null default '{}',
  votes_seen integer not null default 0,
  updated_at timestamptz not null default now()
);

-- A seat in a room. Votes point at the seat, not the profile, so a deleted
-- account leaves an anonymous seat and pass-and-play can give one device
-- several seats later.
create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  profile_id uuid references public.profiles on delete set null,
  controlled_by uuid references public.profiles on delete set null,  -- who may act for this seat
  role public.member_role not null default 'guest',
  display_name text not null,                      -- snapshot, so profiles stay private
  avatar_key text not null,
  provider_ids integer[] not null default '{}',    -- this player's services tonight
  mood_slugs text[] not null default '{}',
  genre_ids integer[] not null default '{}',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_active_at timestamptz not null default now(),
  calibrated_at timestamptz,
  done_at timestamptz,
  swipe_count integer not null default 0,
  super_likes_left smallint not null default 2,
  vetoes_left smallint not null default 1,
  watched_answer public.watched_answer,            -- "Did you watch it?"
  post_reaction public.reaction,
  followup_at timestamptz,
  unique (room_id, profile_id)
);
create index room_members_profile_idx on public.room_members (profile_id);
create index room_members_controlled_by_idx on public.room_members (controlled_by);

-- The room's pool of candidate films, with scores and live counters.
create table public.room_cards (
  room_id uuid not null references public.rooms on delete cascade,
  title_id bigint not null references public.titles,
  source public.card_source not null default 'ranked',
  state public.card_state not null default 'active',
  group_score real not null,
  min_fit real,
  fits jsonb not null default '{}',                -- {member_id: predicted fit 0 to 5}
  reason_code text,                                -- 'watchlist_overlap', 'similar_to_liked', 'runtime_fit', 'wildcard'
  reason_params jsonb not null default '{}',       -- member ids and title ids, rendered on the phone
  member_ratings jsonb not null default '[]',      -- [{"member_id": "...", "rating": 4.5, "liked": true}]
  like_count smallint not null default 0,
  super_like_count smallint not null default 0,
  nope_count smallint not null default 0,
  seen_count smallint not null default 0,
  added_at timestamptz not null default now(),
  primary key (room_id, title_id)
);

-- Each seat's own order through the pool.
create table public.deck_entries (
  room_id uuid not null,
  room_member_id uuid not null references public.room_members on delete cascade,
  title_id bigint not null,
  sort_key double precision not null,
  source public.deck_source not null,
  score real,                                      -- the score that put this card here, for tuning
  queued_at timestamptz not null default now(),
  primary key (room_member_id, title_id),
  foreign key (room_id, title_id) references public.room_cards on delete cascade
);
create index deck_entries_order_idx on public.deck_entries (room_member_id, sort_key);
create index deck_entries_card_idx on public.deck_entries (room_id, title_id);

create table public.votes (
  room_id uuid not null,
  room_member_id uuid not null references public.room_members on delete cascade,
  title_id bigint not null,
  answer public.vote_answer not null,
  created_at timestamptz not null default now(),
  client_created_at timestamptz,                   -- when the phone recorded it, for offline retries
  primary key (room_member_id, title_id),
  foreign key (room_id, title_id) references public.room_cards on delete cascade
);
create index votes_card_idx on public.votes (room_id, title_id);
create index votes_member_time_idx on public.votes (room_member_id, created_at desc);

-- Append-only: every vote and undo, with the score that produced the card.
create table public.swipe_log (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms on delete cascade,
  room_member_id uuid not null,
  title_id bigint not null,
  action public.swipe_action not null,
  answer public.vote_answer not null,
  deck_source public.deck_source,
  score real,
  dwell_ms integer,
  created_at timestamptz not null default now()
);
create index swipe_log_room_idx on public.swipe_log (room_id, created_at);

create table public.matches (
  room_id uuid not null references public.rooms on delete cascade,
  title_id bigint not null references public.titles,
  kind public.match_kind not null,
  like_count smallint not null,
  present_count smallint not null,
  pick_order smallint check (pick_order > 0),      -- 1 is the night's pick
  created_at timestamptz not null default now(),
  primary key (room_id, title_id),
  unique (room_id, pick_order)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  seq smallint not null default 1,
  kind public.finale_kind not null,
  stage public.round_stage not null,
  stage_closes_at timestamptz not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  winner_title_id bigint references public.titles,
  unique (room_id, seq)
);

create table public.round_candidates (
  round_id uuid not null references public.rounds on delete cascade,
  title_id bigint not null references public.titles,
  seed smallint not null,
  vetoed_at timestamptz,
  vetoed_by uuid references public.room_members on delete set null,
  points real not null default 0,
  primary key (round_id, title_id)
);

create table public.round_ballots (
  id bigint generated always as identity primary key,
  round_id uuid not null references public.rounds on delete cascade,
  room_member_id uuid not null references public.room_members on delete cascade,
  kind public.ballot_kind not null,
  title_id bigint references public.titles,        -- null for 'pass'
  rank smallint,
  created_at timestamptz not null default now(),
  check ((kind = 'pass') = (title_id is null)),
  check ((kind = 'rank') = (rank is not null))
);
create unique index round_ballots_veto_once on public.round_ballots (round_id, room_member_id)
  where kind in ('veto', 'pass');
create unique index round_ballots_rank_once on public.round_ballots (round_id, room_member_id, title_id)
  where kind = 'rank';


-- =========================================================================
-- 6. Operations
-- =========================================================================

create table public.rate_limits (
  key text not null,                               -- 'join:<profile id>'
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);


-- =========================================================================
-- 7. Helpers
-- =========================================================================

create function public.my_profile_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid()
$$;

-- The caller's own profile plus the profiles they manage (kid profiles, later).
create function public.my_profile_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid()
  union all
  select k.id from public.profiles k
  join public.profiles p on k.managed_by = p.id
  where p.auth_user_id = auth.uid()
$$;

create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id
      and m.controlled_by in (select public.my_profile_ids())
  )
$$;

-- Realtime topics are 'room:<id>' (server events) and 'room:<id>:live'
-- (presence and reactions sent by phones).
create function public.can_use_room_topic(p_topic text, p_send boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_topic ~ '^room:[0-9a-f-]{36}$' then not p_send
    when p_topic ~ '^room:[0-9a-f-]{36}:live$' then true
    else false
  end
  and public.is_room_member(substring(p_topic from 6 for 36)::uuid)
$$;

create function public.broadcast_room(p_room_id uuid, p_event text, p_payload jsonb)
returns void
language sql security definer set search_path = ''
as $$
  select realtime.send(p_payload, p_event, 'room:' || p_room_id::text, true)
$$;

-- Which match_rules bracket applies to this many present players.
create function public.pick_rule(p_rules jsonb, p_players integer) returns jsonb
language sql immutable set search_path = ''
as $$
  select r
  from jsonb_array_elements(p_rules) r
  order by
    (p_players between (r->>'min_players')::int and (r->>'max_players')::int) desc,
    case when p_players < (r->>'min_players')::int then (r->>'min_players')::int
         else -(r->>'max_players')::int end
  limit 1
$$;

-- Seats that count for match rules: not left, and seen in the last 90 seconds
-- (phones send a heartbeat every 30 seconds while in a room).
create function public.present_member_ids(p_room_id uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.id), '{}')
  from public.room_members m
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_active_at > now() - interval '90 seconds'
$$;

create function public.refresh_room_providers(p_room_id uuid) returns void
language sql security definer set search_path = ''
as $$
  with active as (
    select m.provider_ids from public.room_members m
    where m.room_id = p_room_id and m.left_at is null
  ),
  counts as (
    select p as provider_id, count(*) as n from active, unnest(active.provider_ids) p group by p
  )
  update public.rooms r
  set provider_ids = coalesce((
    select array_agg(c.provider_id order by c.provider_id)
    from counts c
    where r.service_rule = 'any_member' or c.n = (select count(*) from active)
  ), '{}')
  where r.id = p_room_id
$$;


-- =========================================================================
-- 8. Sign-up and account deletion
-- =========================================================================

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, auth_user_id) values (new.id, new.id);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deleting an account cascades to everything personal. Seats in past rooms
-- stay, with their votes, but lose the name: profile_id becomes null.
create function public.scrub_deleted_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_members set display_name = '', avatar_key = 'default' where profile_id = old.id;
  return old;
end
$$;

create trigger on_profile_deleted
  before delete on public.profiles
  for each row execute function public.scrub_deleted_profile();


-- =========================================================================
-- 9. Rooms: create, join, heartbeat, leave
-- =========================================================================

create function public.create_room(p_mode text default 'quick_match', p_country char(2) default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_mode public.game_modes;
  v_room public.rooms;
  v_country char(2);
  i integer;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required');
  end if;

  select * into v_mode from public.game_modes where slug = p_mode and is_active;
  if not found then
    return jsonb_build_object('status', 'unknown_mode');
  end if;

  v_country := coalesce(p_country, v_profile.country);
  if v_country is null then
    return jsonb_build_object('status', 'country_required');
  end if;

  -- Later: the monthly hosting cap and the room's tier are decided here.

  for i in 1..10 loop
    begin
      insert into public.rooms (code, host_id, mode, country, max_players, seen_rule, quality)
      values (
        lpad(floor(random() * 1000000)::integer::text, 6, '0'),
        v_profile.id, v_mode.slug, v_country, v_mode.max_players,
        coalesce((v_mode.defaults->>'seen_rule')::public.seen_rule, 'hide_seen'),
        coalesce((v_mode.defaults->>'quality')::public.quality_preset, 'standard')
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      if i = 10 then raise; end if;
    end;
  end loop;

  insert into public.room_members (room_id, profile_id, controlled_by, role, display_name, avatar_key, provider_ids)
  values (
    v_room.id, v_profile.id, v_profile.id, 'host', v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}')
  );
  insert into public.room_models (room_id) values (v_room.id);
  perform public.refresh_room_providers(v_room.id);

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'code', v_room.code);
end
$$;

-- Never raises on a wrong code: an exception would roll back the attempt
-- counter and make the 6-digit space guessable.
create function public.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_member_id uuid;
  v_hits integer;
  v_seats integer;
begin
  select * into v_profile from public.profiles where auth_user_id = auth.uid();
  if v_profile.id is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  insert into public.rate_limits as rl (key, window_start, hits)
  values ('join:' || v_profile.id, to_timestamp(floor(extract(epoch from now()) / 600) * 600), 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;
  if v_hits > 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_room from public.rooms
  where code = p_code and state in ('lobby', 'swiping', 'finale')
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Rejoin after a dropped connection or an app restart: same seat.
  select id into v_member_id from public.room_members
  where room_id = v_room.id and profile_id = v_profile.id;
  if found then
    update public.room_members set left_at = null, last_active_at = now() where id = v_member_id;
    return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                              'state', v_room.state, 'rejoined', true);
  end if;

  if v_room.state = 'finale' then
    return jsonb_build_object('status', 'in_finale');
  end if;
  if v_profile.display_name = '' then
    return jsonb_build_object('status', 'name_required');
  end if;

  select count(*) into v_seats from public.room_members where room_id = v_room.id and left_at is null;
  if v_seats >= v_room.max_players then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.room_members (room_id, profile_id, controlled_by, display_name, avatar_key, provider_ids)
  values (
    v_room.id, v_profile.id, v_profile.id, v_profile.display_name, v_profile.avatar_key,
    coalesce((select array_agg(pp.provider_id) from public.profile_providers pp where pp.profile_id = v_profile.id), '{}')
  )
  returning id into v_member_id;

  -- Late joiner: deal them the shared opening; the deck engine adds the rest.
  if v_room.state = 'swiping' then
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score)
    select distinct on (d.title_id) d.room_id, v_member_id, d.title_id, d.sort_key, 'opening', d.score
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id
    where d.room_id = v_room.id and d.source = 'opening' and c.state = 'active';
  end if;

  perform public.refresh_room_providers(v_room.id);
  perform public.broadcast_room(v_room.id, 'member_joined', jsonb_build_object(
    'member_id', v_member_id, 'display_name', v_profile.display_name, 'avatar_key', v_profile.avatar_key));

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                            'state', v_room.state, 'rejoined', false);
end
$$;

create function public.touch_room(p_room_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.room_members
  set last_active_at = now()
  where room_id = p_room_id
    and controlled_by in (select public.my_profile_ids())
    and left_at is null
$$;


-- =========================================================================
-- 10. The vote: save, count, match, propagate, in one transaction
-- =========================================================================

-- Moves a liked card into the next few cards of every seat that has not
-- answered it. Returns the seats whose deck changed.
create function public.propagate_like(p_room_id uuid, p_title_id bigint, p_from_member uuid)
returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_seat uuid;
  v_keys double precision[];
  v_key double precision;
  v_touched uuid[] := '{}';
begin
  for v_seat in
    select m.id from public.room_members m
    where m.room_id = p_room_id and m.id <> p_from_member and m.left_at is null
      and not exists (select 1 from public.votes v where v.room_member_id = m.id and v.title_id = p_title_id)
  loop
    select array_agg(u.sort_key order by u.sort_key) into v_keys
    from (
      select d.sort_key from public.deck_entries d
      join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id
      where d.room_member_id = v_seat and d.title_id <> p_title_id and c.state = 'active'
        and not exists (select 1 from public.votes v where v.room_member_id = v_seat and v.title_id = d.title_id)
      order by d.sort_key
      limit 4
    ) u;

    -- Slot it between the 3rd and 4th upcoming card: the phone keeps 3 mounted.
    v_key := case
      when v_keys is null then
        (select coalesce(max(d.sort_key), 0) + 1 from public.deck_entries d where d.room_member_id = v_seat)
      when array_length(v_keys, 1) >= 4 then (v_keys[3] + v_keys[4]) / 2
      else v_keys[array_length(v_keys, 1)] + 0.5
    end;

    insert into public.deck_entries as d (room_id, room_member_id, title_id, sort_key, source)
    values (p_room_id, v_seat, p_title_id, v_key, 'propagated')
    on conflict (room_member_id, title_id) do update
      set sort_key = excluded.sort_key, source = 'propagated'
      where d.sort_key > excluded.sort_key;           -- only ever move a card up
    if found then
      v_touched := v_touched || v_seat;
    end if;
  end loop;
  return v_touched;
end
$$;

-- Applies the room's rule to one card. The caller holds the room lock.
create function public.check_card_match(p_room_id uuid, p_title_id bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_present uuid[];
  v_rule jsonb;
  v_likes integer;
  v_seen integer;
  v_voters integer;
  v_matched boolean;
  v_kind public.match_kind;
  v_decided boolean := false;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if (select c.state from public.room_cards c where c.room_id = p_room_id and c.title_id = p_title_id) <> 'active' then
    return null;
  end if;

  v_present := public.present_member_ids(p_room_id);
  v_rule := public.pick_rule(v_room.rule, cardinality(v_present));

  select count(*) filter (where v.answer in ('like', 'super_like')),
         count(*) filter (where v.answer = 'seen')
  into v_likes, v_seen
  from public.votes v
  where v.room_id = p_room_id and v.title_id = p_title_id and v.room_member_id = any (v_present);

  -- Under allow_rewatch and show_all, "seen it" abstains.
  v_voters := cardinality(v_present) - v_seen;
  v_matched := v_voters >= 2 and case v_rule->>'instant_rule'
    when 'all_like' then v_likes >= v_voters
    when 'share_like' then v_likes >= ceil((v_rule->>'share_threshold')::numeric * v_voters)
    else false
  end;
  if not v_matched then
    return jsonb_build_object('match', false, 'likes', v_likes, 'of', v_voters);
  end if;

  v_kind := case when v_likes >= v_voters then 'unanimous' else 'majority' end;
  update public.room_cards set state = 'matched' where room_id = p_room_id and title_id = p_title_id;
  insert into public.matches (room_id, title_id, kind, like_count, present_count)
  values (p_room_id, p_title_id, v_kind, v_likes, v_voters);

  if v_room.state = 'swiping'
     and (select gm.ends_on_first_match from public.game_modes gm where gm.slug = v_room.mode) then
    update public.matches set pick_order = 1 where room_id = p_room_id and title_id = p_title_id;
    update public.rooms set state = 'done', decided_at = now(), ended_at = now() where id = p_room_id;
    v_decided := true;
  end if;

  perform public.broadcast_room(p_room_id, 'match', jsonb_build_object(
    'title_id', p_title_id, 'kind', v_kind, 'likes', v_likes, 'of', v_voters, 'decided', v_decided));
  return jsonb_build_object('match', true, 'kind', v_kind, 'decided', v_decided);
end
$$;

-- Opens the finale: the top liked cards face off. The caller holds the room lock.
create function public.start_finale(p_room_id uuid, p_rule jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid;
  v_kind public.finale_kind := (p_rule->>'finale_kind')::public.finale_kind;
  v_closes timestamptz;
  v_titles bigint[];
begin
  select array_agg(t.title_id order by t.ord) into v_titles
  from (
    select c.title_id, row_number() over (
      order by (c.state = 'matched') desc, (c.like_count + 2 * c.super_like_count) desc, c.group_score desc) as ord
    from public.room_cards c
    where c.room_id = p_room_id and c.state in ('active', 'matched')
  ) t
  where t.ord <= coalesce((p_rule->>'finale_size')::int, 4);

  v_closes := now() + case v_kind when 'final_cut' then interval '45 seconds' else interval '60 seconds' end;
  insert into public.rounds (room_id, kind, stage, stage_closes_at)
  values (p_room_id, v_kind, case v_kind when 'final_cut' then 'veto' else 'rank' end::public.round_stage, v_closes)
  returning id into v_round_id;

  insert into public.round_candidates (round_id, title_id, seed)
  select v_round_id, t, o::smallint from unnest(v_titles) with ordinality as u(t, o);
  update public.room_cards set state = 'finalist'
  where room_id = p_room_id and title_id = any (v_titles) and state = 'active';
  update public.rooms set state = 'finale', finale_at = now() where id = p_room_id;

  perform public.broadcast_room(p_room_id, 'finale_started', jsonb_build_object(
    'round_id', v_round_id, 'title_ids', to_jsonb(v_titles), 'kind', v_kind, 'closes_at', v_closes));
  return v_round_id;
end
$$;

-- Starts the finale when every present seat has seen enough cards, or time is up.
-- Called after each vote, and by the minute sweeper for the time limit.
create function public.maybe_start_finale(p_room_id uuid) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_present uuid[];
  v_rule jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.state <> 'swiping' then
    return null;
  end if;
  v_present := public.present_member_ids(p_room_id);
  v_rule := public.pick_rule(v_room.rule, cardinality(v_present));

  if ((v_rule->>'finale_after_cards') is not null and cardinality(v_present) > 0 and not exists (
        select 1 from public.room_members m
        where m.id = any (v_present) and m.swipe_count < (v_rule->>'finale_after_cards')::int))
     or ((v_rule->>'finale_after_seconds') is not null
        and now() >= v_room.started_at + make_interval(secs => (v_rule->>'finale_after_seconds')::int)) then
    return public.start_finale(p_room_id, v_rule);
  end if;
  return null;
end
$$;

create function public.cast_vote(
  p_room_id uuid,
  p_title_id bigint,
  p_answer public.vote_answer,
  p_member_id uuid default null,
  p_dwell_ms integer default null,
  p_client_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_entry public.deck_entries;
  v_card public.room_cards;
  v_check jsonb;
  v_touched uuid[];
  v_round uuid;
begin
  -- One lock per room: votes in a room run one after another (a few ms each),
  -- so counting and deciding never race. Rooms do not block each other.
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    raise exception 'room not found' using errcode = '42501';
  end if;

  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select public.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = public.my_profile_id()))
    and m.left_at is null;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if v_room.state <> 'swiping' then
    return jsonb_build_object('status', 'closed', 'state', v_room.state);
  end if;

  select c.* into v_card from public.room_cards c where c.room_id = p_room_id and c.title_id = p_title_id;
  if not found then
    raise exception 'card not in this room' using errcode = '22023';
  end if;
  if v_card.state = 'dropped' then
    return jsonb_build_object('status', 'dropped');
  end if;

  select d.* into v_entry from public.deck_entries d
  where d.room_member_id = v_member.id and d.title_id = p_title_id;
  if not found then
    raise exception 'card was not dealt to this seat' using errcode = '22023';
  end if;

  if p_answer = 'super_like' and v_member.super_likes_left <= 0 then
    return jsonb_build_object('status', 'no_super_likes');
  end if;

  insert into public.votes (room_id, room_member_id, title_id, answer, client_created_at)
  values (p_room_id, v_member.id, p_title_id, p_answer, p_client_at)
  on conflict (room_member_id, title_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'duplicate');   -- an offline retry of a saved vote
  end if;

  update public.room_members
  set swipe_count = swipe_count + 1,
      last_active_at = now(),
      super_likes_left = super_likes_left - (p_answer = 'super_like')::int
  where id = v_member.id;

  update public.room_cards
  set like_count = like_count + (p_answer = 'like')::int,
      super_like_count = super_like_count + (p_answer = 'super_like')::int,
      nope_count = nope_count + (p_answer = 'nope')::int,
      seen_count = seen_count + (p_answer = 'seen')::int
  where room_id = p_room_id and title_id = p_title_id
  returning * into v_card;

  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer, deck_source, score, dwell_ms)
  values (p_room_id, v_member.id, p_title_id, 'vote', p_answer, v_entry.source, v_entry.score, p_dwell_ms);

  -- "Seen it" under hide_seen takes the card out of every deck that has not reached it.
  if p_answer = 'seen' and v_room.seen_rule = 'hide_seen' and v_card.state = 'active' then
    update public.room_cards set state = 'dropped' where room_id = p_room_id and title_id = p_title_id;
    with removed as (
      delete from public.deck_entries d
      where d.room_id = p_room_id and d.title_id = p_title_id
        and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
      returning d.room_member_id
    )
    select coalesce(array_agg(room_member_id), '{}') into v_touched from removed;
    if cardinality(v_touched) > 0 then
      perform public.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
    end if;
  end if;

  if p_answer in ('like', 'super_like') then
    v_check := public.check_card_match(p_room_id, p_title_id);
    if v_check->>'match' = 'false' then
      if v_room.reveal = 'party' and (v_check->>'likes')::int >= 2 then
        perform public.broadcast_room(p_room_id, 'near_miss', jsonb_build_object(
          'title_id', p_title_id, 'likes', v_check->'likes', 'of', v_check->'of'));
      end if;
      if v_card.like_count + v_card.super_like_count = 1 then
        v_touched := public.propagate_like(p_room_id, p_title_id, v_member.id);
        if cardinality(v_touched) > 0 then
          perform public.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
        end if;
      end if;
    end if;
  end if;

  if v_check is null or (v_check->>'decided') is distinct from 'true' then
    v_round := public.maybe_start_finale(p_room_id);
  end if;

  return jsonb_build_object('status', 'ok')
    || jsonb_build_object('match', coalesce(v_check->'match', 'false'::jsonb))
    || case when v_check->>'match' = 'true' then jsonb_build_object('kind', v_check->'kind', 'decided', v_check->'decided')
            else '{}'::jsonb end
    || case when v_round is not null then jsonb_build_object('finale_round_id', v_round) else '{}'::jsonb end;
end
$$;

create function public.undo_last_vote(p_room_id uuid, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_vote public.votes;
  v_card_state public.card_state;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select public.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = public.my_profile_id()));
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if v_room.state <> 'swiping' then
    return jsonb_build_object('status', 'closed');
  end if;

  select v.* into v_vote from public.votes v
  where v.room_member_id = v_member.id order by v.created_at desc limit 1;
  if not found then
    return jsonb_build_object('status', 'nothing_to_undo');
  end if;

  select c.state into v_card_state from public.room_cards c
  where c.room_id = p_room_id and c.title_id = v_vote.title_id;
  if v_card_state <> 'active' then
    return jsonb_build_object('status', 'locked');     -- matched, finalist or dropped
  end if;

  delete from public.votes where room_member_id = v_member.id and title_id = v_vote.title_id;
  update public.room_cards
  set like_count = like_count - (v_vote.answer = 'like')::int,
      super_like_count = super_like_count - (v_vote.answer = 'super_like')::int,
      nope_count = nope_count - (v_vote.answer = 'nope')::int,
      seen_count = seen_count - (v_vote.answer = 'seen')::int
  where room_id = p_room_id and title_id = v_vote.title_id;
  update public.room_members
  set swipe_count = swipe_count - 1,
      super_likes_left = super_likes_left + (v_vote.answer = 'super_like')::int,
      last_active_at = now()
  where id = v_member.id;
  insert into public.swipe_log (room_id, room_member_id, title_id, action, answer)
  values (p_room_id, v_member.id, v_vote.title_id, 'undo', v_vote.answer);

  return jsonb_build_object('status', 'ok', 'title_id', v_vote.title_id);
end
$$;

-- Leaving can complete a match: the players still here may all have liked a card.
create function public.leave_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_member public.room_members;
  v_next uuid;
  v_title bigint;
  v_check jsonb;
begin
  select * into v_room from public.rooms where id = p_room_id for no key update;
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id and m.profile_id = public.my_profile_id() and m.left_at is null;
  if not found then
    return jsonb_build_object('status', 'not_in_room');
  end if;

  update public.room_members set left_at = now() where id = v_member.id;

  if v_member.role = 'host' then
    select m.id into v_next from public.room_members m
    where m.room_id = p_room_id and m.left_at is null order by m.joined_at limit 1;
    update public.room_members set role = 'guest' where id = v_member.id;
    if v_next is not null then
      update public.room_members set role = 'host' where id = v_next;
      update public.rooms set host_id = (select profile_id from public.room_members where id = v_next)
      where id = p_room_id;
    end if;
  end if;

  perform public.refresh_room_providers(p_room_id);
  perform public.broadcast_room(p_room_id, 'member_left', jsonb_build_object(
    'member_id', v_member.id, 'new_host_member_id', v_next));

  if v_room.state = 'swiping' then
    for v_title in
      select c.title_id from public.room_cards c
      where c.room_id = p_room_id and c.state = 'active' and c.like_count + c.super_like_count > 0
      order by c.like_count + c.super_like_count desc
    loop
      v_check := public.check_card_match(p_room_id, v_title);
      exit when (v_check->>'decided') = 'true';
    end loop;
  end if;

  return jsonb_build_object('status', 'ok');
end
$$;

-- Called by the deck engine (service role) once the first cards are dealt.
create function public.begin_swiping(p_room_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
begin
  select mode into v_mode from public.rooms where id = p_room_id and state = 'lobby' for no key update;
  if not found then
    raise exception 'room is not in the lobby' using errcode = '22023';
  end if;
  update public.rooms
  set state = 'swiping',
      started_at = now(),
      rule = (
        select jsonb_agg(to_jsonb(mr) - 'id' - 'mode' order by mr.min_players)
        from public.match_rules mr where mr.mode = v_mode
      )
  where id = p_room_id;
  perform public.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'swiping'));
end
$$;


-- =========================================================================
-- 11. The deck query: eligible films, scored for each seat and the group
-- =========================================================================

-- Fit is a 0 to 5 percentile within each player's own ranking of tonight's
-- eligible films, so models with different similarity ranges behave the same.
-- Players without a taste profile get the popularity prior.
create function public.deck_candidates(
  p_room_id uuid,
  p_limit integer default 300,
  p_misery_line real default 1.0
) returns table (
  title_id bigint,
  group_score real,
  min_fit real,
  fits jsonb,
  watchlist_count integer,
  quality_score real
)
language sql stable security definer set search_path = ''
as $$
  with room as (
    select r.* from public.rooms r where r.id = p_room_id
  ),
  members as (
    select m.id as member_id, m.profile_id, tp.embedding,
           m.genre_ids || coalesce((
             select array_agg(g) from public.moods mo, unnest(mo.include_genre_ids) g
             where mo.slug = any (m.mood_slugs)), '{}') as tonight_genres
    from public.room_members m
    left join public.taste_profiles tp on tp.profile_id = m.profile_id
    where m.room_id = p_room_id and m.left_at is null
  ),
  model as (
    select rm.embedding, rm.dropped_genre_ids from public.room_models rm where rm.room_id = p_room_id
  ),
  seen_by_player as (
    select ut.title_id, ut.profile_id, max(ut.rating) as rating
    from public.user_titles ut
    where ut.seen and ut.profile_id in (select profile_id from members)
    group by ut.title_id, ut.profile_id
  ),
  seen as (
    select s.title_id, bool_and(coalesce(s.rating, 0) >= 4) as rewatchable
    from seen_by_player s group by s.title_id
  ),
  watchlist as (
    select ut.title_id, count(distinct ut.profile_id)::int as n
    from public.user_titles ut
    where ut.on_watchlist and ut.profile_id in (select profile_id from members)
    group by ut.title_id
  ),
  -- Rows stay narrow from here on (no embeddings), so sorts fit in work_mem.
  eligible as (
    select t.id, t.popularity, t.quality_score, t.genre_ids
    from room r
    join public.titles t on t.media_type = 'movie' and t.is_active and not t.is_adult
    left join seen s on s.title_id = t.id
    where (r.runtime_max is null or t.runtime_min <= r.runtime_max)
      and case r.quality
            when 'standard' then t.vote_count >= 150 and t.quality_score >= 6.2
            when 'hidden_gems' then t.vote_count between 30 and 2000 and t.quality_score >= 7.0
            when 'guilty_pleasures' then t.vote_count >= 150 and t.quality_score >= 4.5
          end
      and exists (
            select 1 from public.title_availability a
            where a.title_id = t.id and a.country = r.country
              and a.provider_id = any (r.provider_ids) and a.kind = any (r.offer_kinds))
      and (r.max_age is null or exists (
            select 1 from public.title_certifications c
            where c.title_id = t.id and c.country = r.country and c.min_age <= r.max_age))
      and (r.seen_rule = 'show_all' or s.title_id is null or (r.seen_rule = 'allow_rewatch' and s.rewatchable))
      and not (t.genre_ids && coalesce((select dropped_genre_ids from model), '{}'))
      and not exists (select 1 from public.room_cards rc where rc.room_id = p_room_id and rc.title_id = t.id)
  ),
  -- Players with a taste profile rank by similarity, the rest by popularity.
  raw as (
    select e.id as title_id, m.member_id,
      case when m.embedding is null then e.popularity
           else 1 - (m.embedding operator(extensions.<=>) v.embedding) end as key,
      e.genre_ids && m.tonight_genres as tonight_hit
    from eligible e
    join public.title_vectors v on v.title_id = e.id
    cross join members m
  ),
  per_seat as (
    select r.title_id, r.member_id,
      least(5, percent_rank() over (partition by r.member_id order by r.key) * 5
               + case when r.tonight_hit then 0.5 else 0 end)::real as fit
    from raw r
  ),
  live as (
    select x.title_id, percent_rank() over (order by x.sim) * 5 as signal
    from (
      select e.id as title_id, 1 - (md.embedding operator(extensions.<=>) v.embedding) as sim
      from eligible e
      join public.title_vectors v on v.title_id = e.id
      cross join model md
      where md.embedding is not null
    ) x
  ),
  grouped as (
    select p.title_id, avg(p.fit)::real as avg_fit, min(p.fit)::real as min_fit
    from per_seat p group by p.title_id
  ),
  top as (
    select g.title_id, g.min_fit, t.quality_score, coalesce(w.n, 0) as watchlist_count,
      (g.avg_fit
        + 0.3 * 5 * coalesce(w.n, 0)::real / greatest((select count(*) from members), 1)
        + 0.2 * coalesce(l.signal, 0)
        + 0.1 * coalesce(t.quality_score, 0) / 2)::real as group_score
    from grouped g
    join public.titles t on t.id = g.title_id
    left join watchlist w on w.title_id = g.title_id
    left join live l on l.title_id = g.title_id
    where g.min_fit >= p_misery_line
    order by group_score desc
    limit p_limit
  )
  -- Per-player fits are only assembled for the cards that made the cut.
  select tp.title_id, tp.group_score, tp.min_fit,
    jsonb_object_agg(p.member_id, round(p.fit::numeric, 2)) as fits,
    tp.watchlist_count, tp.quality_score
  from top tp
  join per_seat p on p.title_id = tp.title_id
  group by tp.title_id, tp.group_score, tp.min_fit, tp.watchlist_count, tp.quality_score
  order by tp.group_score desc
$$;


-- =========================================================================
-- 12. Row-level security and grants
-- =========================================================================

alter table public.countries enable row level security;
alter table public.genres enable row level security;
alter table public.keywords enable row level security;
alter table public.people enable row level security;
alter table public.providers enable row level security;
alter table public.provider_regions enable row level security;
alter table public.certification_ages enable row level security;
alter table public.moods enable row level security;
alter table public.titles enable row level security;
alter table public.title_translations enable row level security;
alter table public.title_credits enable row level security;
alter table public.title_certifications enable row level security;
alter table public.title_availability enable row level security;
alter table public.title_watch_links enable row level security;
alter table public.title_deep_links enable row level security;
alter table public.title_vectors enable row level security;
alter table public.calibration_titles enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_providers enable row level security;
alter table public.consents enable row level security;
alter table public.linked_accounts enable row level security;
alter table public.imports enable row level security;
alter table public.import_rows enable row level security;
alter table public.letterboxd_film_map enable row level security;
alter table public.user_titles enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.game_modes enable row level security;
alter table public.match_rules enable row level security;
alter table public.rooms enable row level security;
alter table public.room_models enable row level security;
alter table public.room_members enable row level security;
alter table public.room_cards enable row level security;
alter table public.deck_entries enable row level security;
alter table public.votes enable row level security;
alter table public.swipe_log enable row level security;
alter table public.matches enable row level security;
alter table public.rounds enable row level security;
alter table public.round_candidates enable row level security;
alter table public.round_ballots enable row level security;
alter table public.rate_limits enable row level security;

-- Clients never write directly, except the two grants at the end of this section.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;

-- Catalog and configuration: readable by every signed-in player, guests included.
create policy read_all on public.countries for select to authenticated using (true);
create policy read_all on public.genres for select to authenticated using (true);
create policy read_all on public.keywords for select to authenticated using (true);
create policy read_all on public.people for select to authenticated using (true);
create policy read_all on public.providers for select to authenticated using (true);
create policy read_all on public.provider_regions for select to authenticated using (true);
create policy read_all on public.certification_ages for select to authenticated using (true);
create policy read_all on public.moods for select to authenticated using (is_active);
create policy read_all on public.titles for select to authenticated using (true);
create policy read_all on public.title_translations for select to authenticated using (true);
create policy read_all on public.title_credits for select to authenticated using (true);
create policy read_all on public.title_certifications for select to authenticated using (true);
create policy read_all on public.title_availability for select to authenticated using (true);
create policy read_all on public.title_watch_links for select to authenticated using (true);
create policy read_all on public.title_deep_links for select to authenticated using (true);
create policy read_all on public.calibration_titles for select to authenticated using (is_active);
create policy read_all on public.game_modes for select to authenticated using (is_active);
create policy read_all on public.match_rules for select to authenticated using (true);
-- No client policies: title_vectors, ingest_runs, letterboxd_film_map,
-- room_models, swipe_log, rate_limits. Only the service role reads them.

-- Players: your own data only.
create policy own_read on public.profiles for select to authenticated
  using (id in (select public.my_profile_ids()));
create policy own_update on public.profiles for update to authenticated
  using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));
create policy own_all on public.profile_providers for all to authenticated
  using (profile_id in (select public.my_profile_ids()))
  with check (profile_id in (select public.my_profile_ids()));
create policy own_read on public.consents for select to authenticated
  using (profile_id in (select public.my_profile_ids()));
create policy own_read on public.linked_accounts for select to authenticated
  using (profile_id in (select public.my_profile_ids()));
create policy own_read on public.imports for select to authenticated
  using (linked_account_id in (
    select la.id from public.linked_accounts la where la.profile_id in (select public.my_profile_ids())));
create policy own_read on public.import_rows for select to authenticated
  using (import_id in (
    select i.id from public.imports i join public.linked_accounts la on la.id = i.linked_account_id
    where la.profile_id in (select public.my_profile_ids())));
create policy own_read on public.user_titles for select to authenticated
  using (profile_id in (select public.my_profile_ids()));
create policy own_read on public.taste_profiles for select to authenticated
  using (profile_id in (select public.my_profile_ids()));

-- Rooms: members see the room; nobody can list rooms.
create policy member_read on public.rooms for select to authenticated
  using (public.is_room_member(id));
create policy member_read on public.room_members for select to authenticated
  using (public.is_room_member(room_id));
create policy member_read on public.room_cards for select to authenticated
  using (public.is_room_member(room_id));
create policy member_read on public.matches for select to authenticated
  using (public.is_room_member(room_id));
create policy member_read on public.rounds for select to authenticated
  using (public.is_room_member(room_id));
create policy member_read on public.round_candidates for select to authenticated
  using (round_id in (select r.id from public.rounds r where public.is_room_member(r.room_id)));

-- Your own seat's deck, votes and ballots only. Other players' answers
-- reach you only as the counts the room's reveal mode allows.
create policy own_seat on public.deck_entries for select to authenticated
  using (room_member_id in (
    select m.id from public.room_members m where m.controlled_by in (select public.my_profile_ids())));
create policy own_seat on public.votes for select to authenticated
  using (room_member_id in (
    select m.id from public.room_members m where m.controlled_by in (select public.my_profile_ids())));
create policy own_seat on public.round_ballots for select to authenticated
  using (room_member_id in (
    select m.id from public.room_members m where m.controlled_by in (select public.my_profile_ids())));

-- Counters and scores on room cards would reveal votes in Blind mode.
revoke select on public.room_cards from authenticated;
grant select (room_id, title_id, source, state, reason_code, reason_params, member_ratings, added_at)
  on public.room_cards to authenticated;

-- The two direct client writes.
grant update (display_name, avatar_key, country, language) on public.profiles to authenticated;
grant insert, delete on public.profile_providers to authenticated;

-- Realtime: phones read both room topics and send only on the :live topic.
create policy room_topics_read on realtime.messages for select to authenticated
  using (public.can_use_room_topic((select realtime.topic()), false));
create policy room_topics_send on realtime.messages for insert to authenticated
  with check (public.can_use_room_topic((select realtime.topic()), true));

-- Functions: only the game actions are callable from the app.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.my_profile_id(),
  public.my_profile_ids(),
  public.is_room_member(uuid),
  public.can_use_room_topic(text, boolean),
  public.create_room(text, char),
  public.join_room(text),
  public.touch_room(uuid),
  public.leave_room(uuid),
  public.cast_vote(uuid, bigint, public.vote_answer, uuid, integer, timestamptz),
  public.undo_last_vote(uuid, uuid)
to authenticated;


-- =========================================================================
-- 13. Configuration rows (starting values from the revival plan, to tune)
-- =========================================================================

insert into public.game_modes (slug, min_players, max_players, ends_on_first_match, defaults, sort) values
  ('quick_match', 2, 10, true,  '{}', 1),
  ('final_cut',   2, 10, false, '{}', 2),
  ('date_night',  2, 2,  true,  '{"seen_rule": "hide_seen"}', 3);

insert into public.match_rules
  (mode, min_players, max_players, instant_rule, share_threshold, finale_kind, finale_after_cards, finale_after_seconds, finale_size)
values
  ('quick_match', 2, 2,  'all_like',   null, 'final_cut',   40, null, 3),
  ('quick_match', 3, 4,  'all_like',   null, 'final_cut',   50, 480,  4),
  ('quick_match', 5, 10, 'share_like', 0.70, 'ranked_vote', 50, 600,  4),
  ('date_night',  2, 2,  'all_like',   null, 'final_cut',   40, null, 3),
  ('final_cut',   2, 4,  'all_like',   null, 'final_cut',   30, 600,  4),
  ('final_cut',   5, 10, 'share_like', 0.70, 'final_cut',   30, 600,  4);

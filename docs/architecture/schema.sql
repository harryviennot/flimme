-- MovieMatch data model: reference DDL for the first release.
--
-- A draft to review, not a migration yet. data-model.md in this folder explains
-- every table and how they interact. Target: Supabase Postgres with pgvector,
-- pg_trgm and Supabase Queues (pgmq) enabled.
--
-- Schemas
--   public    Tables. Not exposed through the Data API.
--   api       The only schema the app can reach: views and functions.
--             In Supabase, set Data API > Exposed schemas to "api" only.
--   internal  Game logic and helpers, called by api functions and the server.
--   rec       The recommendation server's own data: requests, models, stats.
--
-- Conventions
--   * The app never touches a table. It reads api views (row-level security
--     still applies underneath) and calls api functions.
--   * The recommendation server connects with a login that has the
--     app_server role. It reads what it needs and writes decks only through
--     internal.deal_cards.
--   * An incompatible change to an api function or view ships as a _v2 next
--     to it, so phones on older app versions keep working.
--   * Functions are security definer with an empty search_path, so every
--     name is schema-qualified.
--   * Catalog ids are TMDB ids, except titles, which use their own id because
--     TMDB numbers movies and TV shows separately.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema api;
create schema internal;
create schema rec;


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

create type public.room_state as enum ('lobby', 'dealing', 'swiping', 'finale', 'done', 'abandoned');
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
-- 2. Catalog (written by the server's ingest jobs only)
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

-- A player's Letterboxd account. Connected only by uploading their own
-- export, which is where the username comes from. Several profiles may link
-- the same username; each keeps its own copy of the data, so nobody can
-- read or delete anyone else's.
create table public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles on delete cascade,
  provider public.linked_provider not null,
  username text not null,                          -- from profile.csv in the export
  consent_id uuid not null references public.consents,
  exported_at timestamptz,                         -- when the latest export was made
  rss_match_share real,                            -- share of the public feed's entries found in the export
  rss_checked_at timestamptz,
  feed_etag text,
  feed_last_modified text,
  last_synced_at timestamptz,                      -- the export counts as a sync
  sync_requested_at timestamptz,
  next_sync_after timestamptz not null default now() + interval '14 days',  -- every sync pushes it 14 days out
  gap_detected_at timestamptz,                     -- the feed moved past what we had: ask for a new export
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

-- One row per film from the export's watched.csv and watchlist.csv, merged
-- on the phone: watched (a seen flag, nothing more) and on the watchlist.
-- Ratings come only from diary entries. Matched rows are applied to
-- user_titles and deleted; unmatched rows stay for the manual fix screen.
create table public.import_rows (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.imports on delete cascade,
  film_name text not null,
  film_year smallint,
  letterboxd_uri text,
  watched boolean not null default false,
  on_watchlist boolean not null default false,
  status public.import_row_status not null default 'pending',
  title_id bigint references public.titles
);
create index import_rows_import_idx on public.import_rows (import_id, status);

-- Every diary entry we have seen for a linked account: the whole diary from
-- the export, then new entries from the RSS feed. An export row and a feed
-- item for the same film and watched date are one entry.
create table public.letterboxd_entries (
  id bigint generated always as identity primary key,
  linked_account_id uuid not null references public.linked_accounts on delete cascade,
  title_id bigint references public.titles,        -- null until the film is matched
  film_name text not null,
  film_year smallint,
  watched_on date not null,                        -- "Watched Date" in the export, letterboxd:watchedDate in RSS
  logged_on date,                                  -- "Date" in the export, the item's pubDate in RSS
  rating numeric(2,1) check (rating between 0.5 and 5 and rating * 2 = floor(rating * 2)),
  rewatch boolean not null default false,
  source text not null check (source in ('export', 'rss')),
  export_uri text,                                 -- boxd.it link of the entry (not of the film)
  rss_guid text,
  first_seen_at timestamptz not null default now()
);
create unique index letterboxd_entries_natural_idx
  on public.letterboxd_entries (linked_account_id, lower(film_name), coalesce(film_year, 0), watched_on);
create index letterboxd_entries_title_idx on public.letterboxd_entries (linked_account_id, title_id);

-- Shared by all players, no personal data: each Letterboxd film is resolved to TMDB once.
create table public.letterboxd_film_map (
  letterboxd_key text primary key,                 -- 'boxd:<id>' from an export film link, or 'slug:<slug>' from RSS
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
  bool_or(ut.on_watchlist) as on_watchlist,
  (array_agg(ut.reaction order by ut.updated_at desc) filter (where ut.reaction is not null))[1] as reaction,
  max(ut.last_watched_on) as last_watched_on
from public.user_titles ut
group by ut.profile_id, ut.title_id;

-- Written by the server's taste worker.
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
  dealing_at timestamptz,                          -- start pressed; the server is dealing
  started_at timestamptz,
  finale_at timestamptz,
  decided_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default now() + interval '3 hours'
);
create unique index rooms_open_code_idx on public.rooms (code) where state in ('lobby', 'dealing', 'swiping', 'finale');
create index rooms_host_started_idx on public.rooms (host_id, started_at);
create index rooms_sweep_idx on public.rooms (expires_at) where state in ('lobby', 'dealing', 'swiping', 'finale');

-- The room's live taste, updated by the server between refills.
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
  refill_requested_at timestamptz,                 -- a refill is queued for this seat
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
  member_ratings jsonb not null default '[]',      -- [{"member_id": "...", "rating": 4.5}]
  like_count smallint not null default 0,
  super_like_count smallint not null default 0,
  nope_count smallint not null default 0,
  seen_count smallint not null default 0,
  added_at timestamptz not null default now(),
  primary key (room_id, title_id)
);


-- =========================================================================
-- 6. Recommendation data (rec schema, owned by the server)
-- =========================================================================

-- Model registry: which ranking models exist and how much traffic each gets.
create table rec.models (
  version text primary key,                        -- 'ranker-2026-11-03'
  kind text not null check (kind in ('baseline', 'taste', 'ranker', 'group')),
  status text not null default 'shadow' check (status in ('shadow', 'active', 'retired')),
  traffic_share numeric(3,2) not null default 0 check (traffic_share between 0 and 1),
  params jsonb not null default '{}',
  metrics jsonb not null default '{}',             -- offline evaluation results
  artifact_path text,                              -- model file in object storage
  trained_from date,
  trained_to date,
  created_at timestamptz not null default now()
);

-- One row per deal: the start of a game, a seat's refill, a re-rank.
create table rec.requests (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms on delete cascade,
  room_member_id uuid references public.room_members on delete set null,  -- null when dealing the whole room
  kind text not null check (kind in ('start', 'refill', 'rerank')),
  model_version text not null,
  experiment text,
  variant text,
  strategy jsonb not null default '{}',            -- exploration rate, misery line, weights used
  candidates integer,
  latency_ms integer,
  is_fallback boolean not null default false,      -- dealt by the SQL baseline, not the server
  created_at timestamptz not null default now()
);
create index requests_room_idx on rec.requests (room_id, created_at);

-- Every card a request ranked for a seat, with what the model knew. Joined to
-- votes on (room_member_id, title_id), this is the training data.
create table rec.request_items (
  request_id bigint not null references rec.requests on delete cascade,
  room_member_id uuid not null,
  title_id bigint not null,
  position smallint not null,
  score real,
  explore boolean not null default false,
  propensity real,                                 -- chance the policy picked this card, for off-policy evaluation
  features jsonb not null default '{}',
  primary key (request_id, room_member_id, title_id)
);
create index request_items_seat_idx on rec.request_items (room_member_id, title_id);

-- How the app's players react to each film, rebuilt nightly from votes.
-- In-app signals only: never aggregates of imported Letterboxd data.
create table rec.title_stats (
  title_id bigint not null references public.titles on delete cascade,
  region text not null default 'all',              -- 'all' or a country code
  impressions integer not null default 0,
  likes integer not null default 0,
  super_likes integer not null default 0,
  nopes integer not null default 0,
  seen integer not null default 0,
  like_rate real,                                  -- smoothed toward the catalog mean
  seen_rate real,
  updated_at timestamptz not null default now(),
  primary key (title_id, region)
);


-- =========================================================================
-- 7. Decks, votes, matches, finale
-- =========================================================================

-- Each seat's own order through the pool.
create table public.deck_entries (
  room_id uuid not null,
  room_member_id uuid not null references public.room_members on delete cascade,
  title_id bigint not null,
  sort_key double precision not null,
  source public.deck_source not null,
  score real,                                      -- the score that put this card here
  request_id bigint references rec.requests on delete set null,
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
-- 8. Operations
-- =========================================================================

create table public.rate_limits (
  key text not null,                               -- 'join:<profile id>'
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Read by the app at launch, e.g. the minimum app version before it must update.
create table public.app_config (
  key text primary key,
  value jsonb not null
);

-- Supabase Queues. The database enqueues; the server consumes.
select pgmq.create(q) from unnest(array[
  'deck_requests',      -- start and refill: latency-sensitive
  'taste_refresh',
  'letterboxd_sync',
  'catalog_refresh',
  'embed_titles',
  'winner_links',
  'room_finished'
]) q;


-- =========================================================================
-- 9. Internal helpers
-- =========================================================================

create function internal.my_profile_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid()
$$;

-- The caller's own profile plus the profiles they manage (kid profiles, later).
create function internal.my_profile_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid()
  union all
  select k.id from public.profiles k
  join public.profiles p on k.managed_by = p.id
  where p.auth_user_id = auth.uid()
$$;

create function internal.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id
      and m.controlled_by in (select internal.my_profile_ids())
  )
$$;

-- Realtime topics are 'room:<id>' (server events) and 'room:<id>:live'
-- (presence and reactions sent by phones).
create function internal.can_use_room_topic(p_topic text, p_send boolean) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when p_topic ~ '^room:[0-9a-f-]{36}$' then not p_send
    when p_topic ~ '^room:[0-9a-f-]{36}:live$' then true
    else false
  end
  and internal.is_room_member(substring(p_topic from 6 for 36)::uuid)
$$;

create function internal.broadcast_room(p_room_id uuid, p_event text, p_payload jsonb)
returns void
language sql security definer set search_path = ''
as $$
  select realtime.send(p_payload, p_event, 'room:' || p_room_id::text, true)
$$;

create function internal.enqueue(p_queue text, p_message jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform pgmq.send(p_queue, p_message);
end
$$;

-- Which match_rules bracket applies to this many present players.
create function internal.pick_rule(p_rules jsonb, p_players integer) returns jsonb
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
create function internal.present_member_ids(p_room_id uuid) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.id), '{}')
  from public.room_members m
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_active_at > now() - interval '90 seconds'
$$;

create function internal.refresh_room_providers(p_room_id uuid) returns void
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

-- Everything a card shows, in the player's language.
create function internal.card_payloads(
  p_title_ids bigint[],
  p_language text,
  p_country char(2),
  p_provider_ids integer[] default null
) returns table (title_id bigint, card jsonb)
language sql stable security definer set search_path = ''
as $$
  select t.id, jsonb_build_object(
    'title_id', t.id,
    'tmdb_id', t.tmdb_id,
    'title', coalesce(tr.title, en.title, t.original_title),
    'overview', coalesce(tr.overview, en.overview),
    'year', t.release_year,
    'runtime_min', t.runtime_min,
    'genre_ids', t.genre_ids,
    'tmdb_score', round(t.vote_average::numeric, 1),
    'tmdb_votes', t.vote_count,
    'poster_path', coalesce(tr.poster_path, t.poster_path),
    'poster_placeholder', t.poster_placeholder,
    'trailer_key', t.trailer_key,
    'directors', (
      select coalesce(jsonb_agg(p.name order by c.ord), '[]')
      from public.title_credits c join public.people p on p.id = c.person_id
      where c.title_id = t.id and c.role = 'director'),
    'cast', (
      select coalesce(jsonb_agg(x.name order by x.ord), '[]')
      from (select p.name, c.ord from public.title_credits c join public.people p on p.id = c.person_id
            where c.title_id = t.id and c.role = 'cast' order by c.ord limit 5) x),
    'providers', (
      select coalesce(jsonb_agg(jsonb_build_object('provider_id', a.provider_id, 'kind', a.kind)
                                order by a.provider_id, a.kind), '[]')
      from public.title_availability a
      where a.title_id = t.id and a.country = p_country
        and (p_provider_ids is null or a.provider_id = any (p_provider_ids))),
    'watch_link', (
      select w.tmdb_link from public.title_watch_links w where w.title_id = t.id and w.country = p_country)
  )
  from public.titles t
  left join public.title_translations tr on tr.title_id = t.id and tr.language = p_language
  left join public.title_translations en on en.title_id = t.id and en.language = 'en'
  where t.id = any (p_title_ids)
$$;


-- =========================================================================
-- 10. Triggers: sign-up, account deletion, room finished
-- =========================================================================

create function internal.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, auth_user_id) values (new.id, new.id);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function internal.handle_new_user();

-- Deleting an account cascades to everything personal. Seats in past rooms
-- stay, with their votes, but lose the name: profile_id becomes null.
create function internal.scrub_deleted_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_members set display_name = '', avatar_key = 'default' where profile_id = old.id;
  return old;
end
$$;

create trigger on_profile_deleted
  before delete on public.profiles
  for each row execute function internal.scrub_deleted_profile();

-- Every way a room can end (Quick Match, finale, leave) passes through here.
create function internal.on_room_state() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.state = 'done' then
    perform internal.enqueue('room_finished', jsonb_build_object('room_id', new.id));
  end if;
  return null;
end
$$;

create trigger on_room_state
  after update of state on public.rooms
  for each row when (new.state is distinct from old.state)
  execute function internal.on_room_state();


-- =========================================================================
-- 11. Game logic (internal, called by api functions)
-- =========================================================================

-- Moves a liked card into the next few cards of every seat that has not
-- answered it. Returns the seats whose deck changed.
create function internal.propagate_like(p_room_id uuid, p_title_id bigint, p_from_member uuid)
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
create function internal.check_card_match(p_room_id uuid, p_title_id bigint) returns jsonb
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

  v_present := internal.present_member_ids(p_room_id);
  v_rule := internal.pick_rule(v_room.rule, cardinality(v_present));

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

  perform internal.broadcast_room(p_room_id, 'match', jsonb_build_object(
    'title_id', p_title_id, 'kind', v_kind, 'likes', v_likes, 'of', v_voters, 'decided', v_decided));
  return jsonb_build_object('match', true, 'kind', v_kind, 'decided', v_decided);
end
$$;

-- Opens the finale: the top liked cards face off. The caller holds the room lock.
create function internal.start_finale(p_room_id uuid, p_rule jsonb) returns uuid
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

  perform internal.broadcast_room(p_room_id, 'finale_started', jsonb_build_object(
    'round_id', v_round_id, 'title_ids', to_jsonb(v_titles), 'kind', v_kind, 'closes_at', v_closes));
  return v_round_id;
end
$$;

-- Starts the finale when every present seat has seen enough cards, or time is up.
-- Called after each vote, and by the minute sweeper for the time limit.
create function internal.maybe_start_finale(p_room_id uuid) returns uuid
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
  v_present := internal.present_member_ids(p_room_id);
  v_rule := internal.pick_rule(v_room.rule, cardinality(v_present));

  if ((v_rule->>'finale_after_cards') is not null and cardinality(v_present) > 0 and not exists (
        select 1 from public.room_members m
        where m.id = any (v_present) and m.swipe_count < (v_rule->>'finale_after_cards')::int))
     or ((v_rule->>'finale_after_seconds') is not null
        and now() >= v_room.started_at + make_interval(secs => (v_rule->>'finale_after_seconds')::int)) then
    return internal.start_finale(p_room_id, v_rule);
  end if;
  return null;
end
$$;

-- Dealing is done: freeze the rules and let everyone swipe.
create function internal.begin_swiping(p_room_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_mode text;
begin
  select mode into v_mode from public.rooms where id = p_room_id and state = 'dealing' for no key update;
  if not found then
    raise exception 'room is not being dealt' using errcode = '22023';
  end if;
  update public.rooms
  set state = 'swiping',
      started_at = now(),
      rule = (
        select jsonb_agg(to_jsonb(mr) - 'id' - 'mode' order by mr.min_players)
        from public.match_rules mr where mr.mode = v_mode
      )
  where id = p_room_id;
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'swiping'));
end
$$;


-- =========================================================================
-- 12. Decks: retrieval in SQL, ranking on the server, one way to write
-- =========================================================================

-- Stage 1 of the recommender: eligible films for the room, scored with a
-- baseline. The server ranks these; the SQL fallback deals them as they are.
-- Fit is a 0 to 5 percentile within each player's own ranking of tonight's
-- eligible films, so models with different similarity ranges behave the same.
-- Players without a taste profile get the popularity prior.
create function internal.deck_candidates(
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

-- The only way a deck is written, by the server or the SQL fallback. Under
-- the room lock it adds cards to the pool, appends to each seat's deck (or
-- replaces everything after the first `keep` upcoming cards: a re-rank),
-- logs the request and every ranked card, and starts the game if the room
-- was waiting for its first deal.
--
-- Payload:
-- {
--   "request": {"kind": "start" | "refill" | "rerank", "model_version": "...",
--               "room_member_id": null, "experiment": null, "variant": null,
--               "strategy": {}, "candidates": 300, "latency_ms": 120},
--   "pool":  [{"title_id": 1, "group_score": 4.1, "min_fit": 2.2, "fits": {},
--              "source": "ranked", "reason_code": "...", "reason_params": {},
--              "member_ratings": []}],
--   "decks": [{"room_member_id": "...", "keep": null,
--              "cards": [{"title_id": 1, "source": "opening", "score": 4.1,
--                         "explore": false, "propensity": 0.9, "features": {}}]}]
-- }
create function internal.deal_cards(p_room_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_request_id bigint;
  v_deck jsonb;
  v_seat uuid;
  v_keep integer;
  v_base double precision;
  v_touched uuid[] := '{}';
  v_started boolean := false;
begin
  select state into v_state from public.rooms where id = p_room_id for no key update;
  if not found or v_state not in ('dealing', 'swiping') then
    return jsonb_build_object('status', 'closed');   -- the room moved on; the server drops its result
  end if;

  insert into rec.requests (room_id, room_member_id, kind, model_version, experiment, variant,
                            strategy, candidates, latency_ms, is_fallback)
  select p_room_id, (r->>'room_member_id')::uuid, coalesce(r->>'kind', 'refill'),
         coalesce(r->>'model_version', 'unknown'), r->>'experiment', r->>'variant',
         coalesce(r->'strategy', '{}'), (r->>'candidates')::int, (r->>'latency_ms')::int,
         coalesce((r->>'is_fallback')::boolean, false)
  from (select coalesce(p_payload->'request', '{}') as r) x
  returning id into v_request_id;

  -- New films join the pool; films already in it take the new scores while still active.
  insert into public.room_cards as c (room_id, title_id, source, group_score, min_fit, fits,
                                      reason_code, reason_params, member_ratings)
  select p_room_id, (p->>'title_id')::bigint, coalesce(p->>'source', 'ranked')::public.card_source,
         (p->>'group_score')::real, (p->>'min_fit')::real, coalesce(p->'fits', '{}'),
         p->>'reason_code', coalesce(p->'reason_params', '{}'), coalesce(p->'member_ratings', '[]')
  from jsonb_array_elements(coalesce(p_payload->'pool', '[]')) p
  on conflict (room_id, title_id) do update
    set group_score = excluded.group_score, min_fit = excluded.min_fit, fits = excluded.fits,
        reason_code = excluded.reason_code, reason_params = excluded.reason_params,
        member_ratings = excluded.member_ratings
    where c.state = 'active';

  for v_deck in select d from jsonb_array_elements(coalesce(p_payload->'decks', '[]')) d loop
    v_seat := (v_deck->>'room_member_id')::uuid;
    perform 1 from public.room_members m where m.id = v_seat and m.room_id = p_room_id;
    if not found then
      continue;
    end if;
    v_keep := (v_deck->>'keep')::int;

    -- Re-rank: keep the next `keep` cards (the phone has them mounted) and
    -- cards moved up by a like; replace the rest of the upcoming deck.
    if v_keep is not null then
      delete from public.deck_entries d
      where d.room_member_id = v_seat
        and d.source <> 'propagated'
        and not exists (select 1 from public.votes v where v.room_member_id = v_seat and v.title_id = d.title_id)
        and d.title_id not in (
          select u.title_id from public.deck_entries u
          where u.room_member_id = v_seat
            and not exists (select 1 from public.votes v where v.room_member_id = v_seat and v.title_id = u.title_id)
          order by u.sort_key
          limit v_keep);
    end if;

    select coalesce(max(d.sort_key), 0) into v_base from public.deck_entries d where d.room_member_id = v_seat;

    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score, request_id)
    select p_room_id, v_seat, (x.c->>'title_id')::bigint, v_base + x.o,
           coalesce(x.c->>'source', 'ranked')::public.deck_source, (x.c->>'score')::real, v_request_id
    from jsonb_array_elements(v_deck->'cards') with ordinality as x(c, o)
    join public.room_cards rc on rc.room_id = p_room_id and rc.title_id = (x.c->>'title_id')::bigint
                              and rc.state = 'active'
    where not exists (select 1 from public.votes v
                      where v.room_member_id = v_seat and v.title_id = (x.c->>'title_id')::bigint)
    on conflict (room_member_id, title_id) do nothing;

    insert into rec.request_items (request_id, room_member_id, title_id, position, score, explore, propensity, features)
    select v_request_id, v_seat, (x.c->>'title_id')::bigint, x.o::smallint, (x.c->>'score')::real,
           coalesce((x.c->>'explore')::boolean, false), (x.c->>'propensity')::real, coalesce(x.c->'features', '{}')
    from jsonb_array_elements(v_deck->'cards') with ordinality as x(c, o)
    on conflict do nothing;

    update public.room_members set refill_requested_at = null where id = v_seat;
    v_touched := v_touched || v_seat;
  end loop;

  if v_state = 'dealing' then
    perform internal.begin_swiping(p_room_id);
    v_started := true;
  elsif cardinality(v_touched) > 0 then
    perform internal.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
  end if;

  return jsonb_build_object('status', 'ok', 'request_id', v_request_id, 'started', v_started,
                            'seats', cardinality(v_touched));
end
$$;

-- SQL-only dealer, for when the server does not answer in time: the baseline
-- scores, the same order for every seat, the first 10 as the shared opening.
create function internal.deal_baseline(p_room_id uuid, p_seat uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_cards jsonb;
begin
  select state into v_state from public.rooms where id = p_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'title_id', c.title_id, 'group_score', c.group_score, 'min_fit', c.min_fit,
           'fits', c.fits, 'score', c.group_score) order by c.group_score desc), '[]')
  into v_cards from internal.deck_candidates(p_room_id, 30, 1.0) c;
  if jsonb_array_length(v_cards) < 10 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'title_id', c.title_id, 'group_score', c.group_score, 'min_fit', c.min_fit,
             'fits', c.fits, 'score', c.group_score) order by c.group_score desc), '[]')
    into v_cards from internal.deck_candidates(p_room_id, 30, 0) c;
  end if;

  return internal.deal_cards(p_room_id, jsonb_build_object(
    'request', jsonb_build_object(
      'kind', case when v_state = 'dealing' then 'start' else 'refill' end,
      'model_version', 'sql-baseline', 'is_fallback', true,
      'room_member_id', p_seat, 'candidates', jsonb_array_length(v_cards)),
    'pool', v_cards,
    'decks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'room_member_id', m.id,
        'cards', (select jsonb_agg(jsonb_set(x.c, '{source}',
                    to_jsonb(case when v_state = 'dealing' and x.o <= 10 then 'opening' else 'ranked' end))
                    order by x.o)
                  from jsonb_array_elements(v_cards) with ordinality as x(c, o)))), '[]')
      from public.room_members m
      where m.room_id = p_room_id and m.left_at is null and (p_seat is null or m.id = p_seat))));
end
$$;


-- =========================================================================
-- 13. Letterboxd: export, feed and schedule (internal, called by the server)
-- =========================================================================

-- Step 1 of connecting, called by the server's HTTP API once it has checked
-- the player's token and compared the export with the public feed. A
-- different username replaces the profile's old link and everything that came
-- with it. Films go to import_rows for matching; the diary goes straight in.
--
-- Payload, built on the phone from the export ZIP. Only the username from
-- profile.csv, watched.csv, watchlist.csv and diary.csv are read; nothing
-- else leaves the phone:
-- {"username": "hryvnt", "exported_at": "2026-10-29T11:01:00Z", "consent_version": "v1",
--  "rss_match_share": 0.98,
--  "films": [{"uri": "https://boxd.it/AbC1", "name": "...", "year": 2019,
--             "watched": true, "on_watchlist": false}],
--  "diary": [{"uri": "https://boxd.it/xYz9", "name": "...", "year": 2019,
--             "watched_on": "2026-10-21", "logged_on": "2026-10-22", "rating": 4, "rewatch": false}]}
create function internal.start_letterboxd_import(p_profile_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_username text := lower(btrim(p_payload->>'username'));
  v_account public.linked_accounts;
  v_consent uuid;
  v_import uuid;
  v_films integer;
  v_entries integer;
begin
  if v_username is null or v_username !~ '^[a-z0-9_]{1,30}$' then
    return jsonb_build_object('status', 'invalid_username');
  end if;

  select * into v_account from public.linked_accounts
  where profile_id = p_profile_id and provider = 'letterboxd'
  for update;
  if found and v_account.username <> v_username then
    delete from public.linked_accounts where id = v_account.id;
    v_account := null;
  end if;

  select id into v_consent from public.consents
  where profile_id = p_profile_id and kind = 'letterboxd_import' and revoked_at is null;
  if v_consent is null then
    insert into public.consents (profile_id, kind, version)
    values (p_profile_id, 'letterboxd_import', coalesce(p_payload->>'consent_version', 'v1'))
    returning id into v_consent;
  end if;

  if v_account.id is null then
    insert into public.linked_accounts (profile_id, provider, username, consent_id)
    values (p_profile_id, 'letterboxd', v_username, v_consent)
    returning * into v_account;
  end if;
  update public.linked_accounts
  set consent_id = v_consent,
      exported_at = (p_payload->>'exported_at')::timestamptz,
      rss_match_share = (p_payload->>'rss_match_share')::real,
      rss_checked_at = now(),
      gap_detected_at = null,
      last_error = null
  where id = v_account.id;

  insert into public.imports (linked_account_id, kind, status)
  values (v_account.id, 'export', 'matching')
  returning id into v_import;

  insert into public.import_rows (import_id, film_name, film_year, letterboxd_uri, watched, on_watchlist)
  select v_import, f->>'name', (f->>'year')::smallint, f->>'uri',
         coalesce((f->>'watched')::boolean, false), coalesce((f->>'on_watchlist')::boolean, false)
  from jsonb_array_elements(coalesce(p_payload->'films', '[]')) f;
  get diagnostics v_films = row_count;

  insert into public.letterboxd_entries as e
    (linked_account_id, film_name, film_year, watched_on, logged_on, rating, rewatch, source, export_uri)
  select v_account.id, d->>'name', (d->>'year')::smallint, (d->>'watched_on')::date, (d->>'logged_on')::date,
         (d->>'rating')::numeric, coalesce((d->>'rewatch')::boolean, false), 'export', d->>'uri'
  from jsonb_array_elements(coalesce(p_payload->'diary', '[]')) d
  where d->>'watched_on' is not null
  on conflict (linked_account_id, lower(film_name), coalesce(film_year, 0), watched_on) do update
    set rating = coalesce(excluded.rating, e.rating),
        rewatch = excluded.rewatch,
        logged_on = coalesce(e.logged_on, excluded.logged_on),
        export_uri = coalesce(e.export_uri, excluded.export_uri);
  get diagnostics v_entries = row_count;

  update public.imports set films_total = v_films where id = v_import;
  return jsonb_build_object('status', 'ok', 'linked_account_id', v_account.id, 'import_id', v_import,
                            'films', v_films, 'entries', v_entries);
end
$$;

-- Per film, what the diary entries say: last watch, last log, number of
-- watches, and the rating on the most recently logged rated entry.
create function internal.letterboxd_entry_facts(p_account_id uuid)
returns table (title_id bigint, last_watched date, last_logged date, watches integer, latest_rating numeric)
language sql stable security definer set search_path = ''
as $$
  select e.title_id,
         max(e.watched_on),
         max(e.logged_on),
         count(*)::int,
         (array_agg(e.rating order by e.logged_on desc nulls last, e.watched_on desc)
            filter (where e.rating is not null))[1]
  from public.letterboxd_entries e
  where e.linked_account_id = p_account_id and e.title_id is not null
  group by e.title_id
$$;

-- Folds diary entries into the per-film rows in user_titles: seen, the latest
-- rating, number of watches, last watch. A film logged after the export no
-- longer counts as on the watchlist; one re-added after an older watch stays.
create function internal.fold_letterboxd_entries(p_account_id uuid, p_title_ids bigint[] default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile uuid;
  v_since date;
begin
  select la.profile_id, la.exported_at::date into v_profile, v_since
  from public.linked_accounts la where la.id = p_account_id;

  update public.user_titles ut
  set seen = true,
      rating = coalesce(f.latest_rating, ut.rating),
      on_watchlist = ut.on_watchlist and coalesce(f.last_logged <= v_since, true),
      rewatch_count = greatest(f.watches - 1, 0),
      last_watched_on = greatest(ut.last_watched_on, f.last_watched),
      updated_at = now()
  from internal.letterboxd_entry_facts(p_account_id) f
  where ut.profile_id = v_profile and ut.source = 'letterboxd' and ut.title_id = f.title_id
    and (p_title_ids is null or f.title_id = any (p_title_ids));

  insert into public.user_titles (profile_id, title_id, source, linked_account_id, seen, rating,
                                  rewatch_count, last_watched_on)
  select v_profile, f.title_id, 'letterboxd', p_account_id, true, f.latest_rating,
         greatest(f.watches - 1, 0), f.last_watched
  from internal.letterboxd_entry_facts(p_account_id) f
  where (p_title_ids is null or f.title_id = any (p_title_ids))
    and not exists (select 1 from public.user_titles ut
                    where ut.profile_id = v_profile and ut.title_id = f.title_id and ut.source = 'letterboxd');
end
$$;

-- Step 2, once the server has matched the films (title_id and status set on
-- import_rows). The export is the account's complete per-film state at export
-- time, so it replaces the account's Letterboxd rows; then the diary is folded in.
create function internal.finish_letterboxd_import(p_import_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_profile uuid;
  v_matched integer;
  v_unmatched integer;
begin
  select i.linked_account_id, la.profile_id into v_account, v_profile
  from public.imports i join public.linked_accounts la on la.id = i.linked_account_id
  where i.id = p_import_id and i.status = 'matching'
  for update of i;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Diary rows only carry the film's name and year; take the title from the matched film.
  update public.letterboxd_entries e
  set title_id = r.title_id
  from public.import_rows r
  where r.import_id = p_import_id and r.status = 'matched'
    and e.linked_account_id = v_account and e.title_id is null
    and lower(e.film_name) = lower(r.film_name) and coalesce(e.film_year, 0) = coalesce(r.film_year, 0);

  delete from public.user_titles where linked_account_id = v_account;
  insert into public.user_titles (profile_id, title_id, source, linked_account_id, seen, on_watchlist)
  select distinct on (r.title_id) v_profile, r.title_id, 'letterboxd', v_account,
         r.watched, r.on_watchlist
  from public.import_rows r
  where r.import_id = p_import_id and r.status = 'matched'
  order by r.title_id, r.watched desc;
  perform internal.fold_letterboxd_entries(v_account);

  select count(*) filter (where status = 'matched'), count(*) filter (where status = 'unmatched')
  into v_matched, v_unmatched
  from public.import_rows where import_id = p_import_id;
  delete from public.import_rows where import_id = p_import_id and status = 'matched';

  update public.imports
  set status = 'done', finished_at = now(), films_matched = v_matched, films_unmatched = v_unmatched
  where id = p_import_id;
  update public.linked_accounts
  set last_synced_at = now(), next_sync_after = now() + interval '14 days'
  where id = v_account;

  perform internal.enqueue('taste_refresh', jsonb_build_object('profile_id', v_profile, 'reason', 'letterboxd_export'));
  return jsonb_build_object('status', 'ok', 'matched', v_matched, 'unmatched', v_unmatched);
end
$$;

-- An RSS sync. The server fetches the feed (conditionally; a 304 is an empty
-- item list) and passes the items as they are, with TMDB ids from the feed:
-- [{"guid": "letterboxd-watch-123", "tmdb_id": 550, "film_title": "...", "film_year": 1999,
--   "watched_on": "2026-10-28", "published_at": "2026-10-28T21:00:00Z",
--   "rating": 4.5, "rewatch": false}]
create function internal.apply_letterboxd_feed(
  p_account_id uuid,
  p_items jsonb,
  p_etag text default null,
  p_last_modified text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile uuid;
  v_had integer;
  v_known integer;
  v_new integer;
  v_titles bigint[];
  v_gap boolean;
begin
  select la.profile_id into v_profile from public.linked_accounts la where la.id = p_account_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');     -- disconnected while the sync was queued
  end if;

  select count(*) into v_had from public.letterboxd_entries where linked_account_id = p_account_id;
  select count(*) into v_known
  from jsonb_array_elements(p_items) i
  where exists (
    select 1 from public.letterboxd_entries e
    where e.linked_account_id = p_account_id
      and (e.rss_guid = i->>'guid'
           or (lower(e.film_name) = lower(i->>'film_title')
               and coalesce(e.film_year, 0) = coalesce((i->>'film_year')::int, 0)
               and e.watched_on = (i->>'watched_on')::date)));

  with written as (
    insert into public.letterboxd_entries as e
      (linked_account_id, title_id, film_name, film_year, watched_on, logged_on, rating, rewatch, source, rss_guid)
    select p_account_id, t.id, i->>'film_title', (i->>'film_year')::smallint, (i->>'watched_on')::date,
           (i->>'published_at')::timestamptz::date, (i->>'rating')::numeric,
           coalesce((i->>'rewatch')::boolean, false), 'rss', i->>'guid'
    from jsonb_array_elements(p_items) i
    left join public.titles t on t.media_type = 'movie' and t.tmdb_id = (i->>'tmdb_id')::int
    where i->>'watched_on' is not null
    on conflict (linked_account_id, lower(film_name), coalesce(film_year, 0), watched_on) do update
      set rss_guid = coalesce(e.rss_guid, excluded.rss_guid),
          title_id = coalesce(e.title_id, excluded.title_id),
          rating = coalesce(excluded.rating, e.rating)
    returning e.title_id, (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), array_agg(distinct title_id) filter (where title_id is not null)
  into v_new, v_titles
  from written;

  if cardinality(v_titles) > 0 then
    perform internal.fold_letterboxd_entries(p_account_id, v_titles);
  end if;

  -- The feed carries about 50 entries. If it is full and none of them were
  -- already here, entries were logged in between that we will never see.
  v_gap := v_had > 0 and v_known = 0 and jsonb_array_length(p_items) >= 50;

  update public.linked_accounts
  set last_synced_at = now(),
      sync_requested_at = null,
      next_sync_after = now() + interval '14 days',
      feed_etag = coalesce(p_etag, feed_etag),
      feed_last_modified = coalesce(p_last_modified, feed_last_modified),
      gap_detected_at = case when v_gap then now() else gap_detected_at end,
      last_error = null
  where id = p_account_id;

  if v_new > 0 then
    perform internal.enqueue('taste_refresh', jsonb_build_object('profile_id', v_profile, 'reason', 'letterboxd_feed'));
  end if;
  return jsonb_build_object('status', 'ok', 'new', v_new, 'known', v_known, 'gap', v_gap);
end
$$;

-- Hourly: queue the scheduled syncs that are due. Every successful sync,
-- whatever triggered it (the export, joining a room, this job), pushes
-- next_sync_after 14 days out, so this only picks accounts with no sync in
-- 14 days: in practice, players who haven't played in that time. A sync
-- queued on join that failed leaves the account due, so this catches it.
-- Players who haven't played for 12 months stop being synced.
create function internal.enqueue_due_letterboxd_syncs() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_account_id uuid;
  v_count integer := 0;
begin
  for v_account_id in
    update public.linked_accounts la
    set sync_requested_at = now()
    from public.profiles p
    where p.id = la.profile_id
      and la.next_sync_after <= now()
      and (la.sync_requested_at is null or la.sync_requested_at < now() - interval '1 hour')
      and coalesce(p.last_seen_at, la.created_at) > now() - interval '12 months'
    returning la.id
  loop
    perform internal.enqueue('letterboxd_sync', jsonb_build_object(
      'linked_account_id', v_account_id, 'reason', 'scheduled'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;


-- =========================================================================
-- 14. api: profile and personal data
-- =========================================================================

create function api.update_profile(
  p_display_name text default null,
  p_avatar_key text default null,
  p_country char(2) default null,
  p_language text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if p_display_name is not null and char_length(btrim(p_display_name)) not between 1 and 24 then
    return jsonb_build_object('status', 'invalid_name');
  end if;
  update public.profiles
  set display_name = coalesce(btrim(p_display_name), display_name),
      avatar_key = coalesce(p_avatar_key, avatar_key),
      country = coalesce(p_country, country),
      language = coalesce(p_language, language),
      updated_at = now()
  where auth_user_id = auth.uid();
  if not found then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  return jsonb_build_object('status', 'ok');
end
$$;

create function api.set_my_providers(p_provider_ids integer[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
begin
  if v_me is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;
  delete from public.profile_providers where profile_id = v_me and provider_id <> all (p_provider_ids);
  insert into public.profile_providers (profile_id, provider_id)
  select v_me, p from unnest(p_provider_ids) p
  on conflict do nothing;
  return jsonb_build_object('status', 'ok');
end
$$;

-- Removes the caller's Letterboxd link and everything that came with it:
-- imports, diary entries and per-film rows. Nobody else's copy is touched.
create function api.disconnect_letterboxd() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
begin
  delete from public.linked_accounts where profile_id = v_me and provider = 'letterboxd';
  if not found then
    return jsonb_build_object('status', 'not_linked');
  end if;
  update public.consents set revoked_at = now()
  where profile_id = v_me and kind = 'letterboxd_import' and revoked_at is null;
  perform internal.enqueue('taste_refresh', jsonb_build_object('profile_id', v_me, 'reason', 'letterboxd_disconnected'));
  return jsonb_build_object('status', 'ok');
end
$$;

-- GDPR export: everything stored about the caller.
create function api.export_my_data() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (select internal.my_profile_id() as id)
  select jsonb_build_object(
    'profile', (select to_jsonb(p) - 'auth_user_id' from public.profiles p, me where p.id = me.id),
    'services', (select coalesce(jsonb_agg(pp.provider_id), '[]') from public.profile_providers pp, me where pp.profile_id = me.id),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id'), '[]') from public.consents c, me where c.profile_id = me.id),
    'linked_accounts', (
      select coalesce(jsonb_agg(jsonb_build_object('provider', la.provider, 'username', la.username,
                                                   'created_at', la.created_at, 'exported_at', la.exported_at,
                                                   'last_synced_at', la.last_synced_at)), '[]')
      from public.linked_accounts la, me where la.profile_id = me.id),
    'letterboxd_diary', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'film', e.film_name, 'year', e.film_year, 'watched_on', e.watched_on, 'rating', e.rating,
               'rewatch', e.rewatch, 'source', e.source) order by e.watched_on), '[]')
      from public.letterboxd_entries e join public.linked_accounts la on la.id = e.linked_account_id, me
      where la.profile_id = me.id),
    'film_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tmdb_id', t.tmdb_id, 'title', t.original_title, 'source', ut.source, 'seen', ut.seen,
               'rating', ut.rating, 'on_watchlist', ut.on_watchlist,
               'reaction', ut.reaction, 'last_watched_on', ut.last_watched_on)), '[]')
      from public.user_titles ut join public.titles t on t.id = ut.title_id, me
      where ut.profile_id = me.id),
    'taste', (select tp.affinities from public.taste_profiles tp, me where tp.profile_id = me.id),
    'games', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'room_id', m.room_id, 'joined_at', m.joined_at,
               'votes', (select coalesce(jsonb_agg(jsonb_build_object('tmdb_id', t.tmdb_id, 'answer', v.answer,
                                                                      'at', v.created_at)), '[]')
                         from public.votes v join public.titles t on t.id = v.title_id
                         where v.room_member_id = m.id))), '[]')
      from public.room_members m, me where m.profile_id = me.id)
  )
$$;


-- =========================================================================
-- 15. api: rooms
-- =========================================================================

create function api.create_room(p_mode text default 'quick_match', p_country char(2) default null)
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
  perform internal.refresh_room_providers(v_room.id);

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'code', v_room.code);
end
$$;

-- Never raises on a wrong code: an exception would roll back the attempt
-- counter and make the 6-digit space guessable.
create function api.join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_member_id uuid;
  v_hits integer;
  v_seats integer;
  v_account_id uuid;
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
  where code = p_code and state in ('lobby', 'dealing', 'swiping', 'finale')
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Fresh Letterboxd data for tonight: sync if the last one is over 6 hours old.
  update public.profiles set last_seen_at = now() where id = v_profile.id;
  for v_account_id in
    update public.linked_accounts la
    set sync_requested_at = now()
    where la.profile_id = v_profile.id
      and (la.last_synced_at is null or la.last_synced_at < now() - interval '6 hours')
      and (la.sync_requested_at is null or la.sync_requested_at < now() - interval '10 minutes')
    returning la.id
  loop
    perform internal.enqueue('letterboxd_sync', jsonb_build_object(
      'linked_account_id', v_account_id, 'reason', 'joined_room'));
  end loop;

  -- Rejoin after a dropped connection or an app restart: same seat.
  select id into v_member_id from public.room_members
  where room_id = v_room.id and profile_id = v_profile.id;
  if found then
    update public.room_members set left_at = null, last_active_at = now() where id = v_member_id;
    return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                              'state', v_room.state, 'rejoined', true);
  end if;

  if v_room.state = 'dealing' then
    return jsonb_build_object('status', 'starting');    -- try again in a second
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

  -- Late joiner: deal them the shared opening now, and ask the server for the rest.
  if v_room.state = 'swiping' then
    insert into public.deck_entries (room_id, room_member_id, title_id, sort_key, source, score)
    select distinct on (d.title_id) d.room_id, v_member_id, d.title_id, d.sort_key, 'opening', d.score
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id
    where d.room_id = v_room.id and d.source = 'opening' and c.state = 'active';
    update public.room_members set refill_requested_at = now() where id = v_member_id;
    perform internal.enqueue('deck_requests', jsonb_build_object(
      'kind', 'refill', 'room_id', v_room.id, 'room_member_id', v_member_id));
  end if;

  perform internal.refresh_room_providers(v_room.id);
  perform internal.broadcast_room(v_room.id, 'member_joined', jsonb_build_object(
    'member_id', v_member_id, 'display_name', v_profile.display_name, 'avatar_key', v_profile.avatar_key));

  return jsonb_build_object('status', 'ok', 'room_id', v_room.id, 'member_id', v_member_id,
                            'state', v_room.state, 'rejoined', false);
end
$$;

create function api.touch_room(p_room_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.room_members
  set last_active_at = now()
  where room_id = p_room_id
    and controlled_by in (select internal.my_profile_ids())
    and left_at is null
$$;

-- Leaving can complete a match: the players still here may all have liked a card.
create function api.leave_room(p_room_id uuid) returns jsonb
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
  where m.room_id = p_room_id and m.profile_id = internal.my_profile_id() and m.left_at is null;
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

  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'member_left', jsonb_build_object(
    'member_id', v_member.id, 'new_host_member_id', v_next));

  if v_room.state = 'swiping' then
    for v_title in
      select c.title_id from public.room_cards c
      where c.room_id = p_room_id and c.state = 'active' and c.like_count + c.super_like_count > 0
      order by c.like_count + c.super_like_count desc
    loop
      v_check := internal.check_card_match(p_room_id, v_title);
      exit when (v_check->>'decided') = 'true';
    end loop;
  end if;

  return jsonb_build_object('status', 'ok');
end
$$;

-- Host only, lobby only. Keys left out of p_settings stay as they are.
create function api.update_room_settings(p_room_id uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
begin
  select state into v_state from public.rooms r
  where r.id = p_room_id
    and exists (select 1 from public.room_members m
                where m.room_id = r.id and m.role = 'host' and m.profile_id = internal.my_profile_id()
                  and m.left_at is null)
  for no key update;
  if not found then
    raise exception 'only the host can change settings' using errcode = '42501';
  end if;
  if v_state <> 'lobby' then
    return jsonb_build_object('status', 'closed');
  end if;

  update public.rooms
  set service_rule = coalesce((p_settings->>'service_rule')::public.service_rule, service_rule),
      runtime_max = case when p_settings ? 'runtime_max' then (p_settings->>'runtime_max')::smallint else runtime_max end,
      seen_rule = coalesce((p_settings->>'seen_rule')::public.seen_rule, seen_rule),
      quality = coalesce((p_settings->>'quality')::public.quality_preset, quality),
      max_age = case when p_settings ? 'max_age' then (p_settings->>'max_age')::smallint else max_age end,
      reveal = coalesce((p_settings->>'reveal')::public.reveal_mode, reveal)
  where id = p_room_id;
  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'settings_changed', p_settings);
  return jsonb_build_object('status', 'ok');
end
$$;

-- A player's own settings for tonight. Null arguments stay as they are.
create function api.set_seat_prefs(
  p_room_id uuid,
  p_provider_ids integer[] default null,
  p_mood_slugs text[] default null,
  p_genre_ids integer[] default null,
  p_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_seat uuid;
begin
  perform 1 from public.rooms where id = p_room_id and state in ('lobby', 'swiping') for no key update;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;
  update public.room_members m
  set provider_ids = coalesce(p_provider_ids, m.provider_ids),
      mood_slugs = coalesce(p_mood_slugs, m.mood_slugs),
      genre_ids = coalesce(p_genre_ids, m.genre_ids),
      last_active_at = now()
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
  returning m.id into v_seat;
  if v_seat is null then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  perform internal.refresh_room_providers(p_room_id);
  perform internal.broadcast_room(p_room_id, 'seat_updated', jsonb_build_object('member_id', v_seat));
  return jsonb_build_object('status', 'ok');
end
$$;

-- Host taps start. The server deals; if it has not within 8 seconds, the
-- host's phone calls this again and the SQL baseline deals instead.
create function api.start_game(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.rooms;
  v_min smallint;
begin
  select r.* into v_room from public.rooms r
  where r.id = p_room_id
    and exists (select 1 from public.room_members m
                where m.room_id = r.id and m.role = 'host' and m.profile_id = internal.my_profile_id()
                  and m.left_at is null)
  for no key update;
  if not found then
    raise exception 'only the host can start' using errcode = '42501';
  end if;

  if v_room.state = 'dealing' then
    if now() - v_room.dealing_at > interval '8 seconds' then
      return internal.deal_baseline(p_room_id) || jsonb_build_object('fallback', true);
    end if;
    return jsonb_build_object('status', 'dealing');
  end if;
  if v_room.state <> 'lobby' then
    return jsonb_build_object('status', 'closed', 'state', v_room.state);
  end if;

  select gm.min_players into v_min from public.game_modes gm where gm.slug = v_room.mode;
  if cardinality(internal.present_member_ids(p_room_id)) < v_min then
    return jsonb_build_object('status', 'not_enough_players', 'need', v_min);
  end if;

  update public.rooms set state = 'dealing', dealing_at = now() where id = p_room_id;
  perform internal.enqueue('deck_requests', jsonb_build_object('kind', 'start', 'room_id', p_room_id));
  perform internal.broadcast_room(p_room_id, 'state_changed', jsonb_build_object('state', 'dealing'));
  return jsonb_build_object('status', 'dealing');
end
$$;

-- The phone is running low and no refill has arrived: queue one, or after
-- 8 seconds of silence from the server, deal the SQL baseline now.
create function api.request_cards(p_room_id uuid, p_member_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_state public.room_state;
  v_member public.room_members;
  v_remaining integer;
begin
  select state into v_state from public.rooms where id = p_room_id for no key update;
  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
    and m.left_at is null;
  if not found then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if v_state <> 'swiping' then
    return jsonb_build_object('status', 'closed', 'state', v_state);
  end if;

  select count(*) into v_remaining
  from public.deck_entries d
  join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
  where d.room_member_id = v_member.id
    and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id);
  if v_remaining > 5 then
    return jsonb_build_object('status', 'enough', 'remaining', v_remaining);
  end if;

  if v_member.refill_requested_at is null then
    update public.room_members set refill_requested_at = now() where id = v_member.id;
    perform internal.enqueue('deck_requests', jsonb_build_object(
      'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
    return jsonb_build_object('status', 'queued');
  end if;
  if now() - v_member.refill_requested_at > interval '8 seconds' then
    return internal.deal_baseline(p_room_id, v_member.id) || jsonb_build_object('fallback', true);
  end if;
  return jsonb_build_object('status', 'queued');
end
$$;


-- =========================================================================
-- 16. api: the vote. Save, count, match, propagate, in one transaction
-- =========================================================================

create function api.cast_vote(
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
  v_remaining integer;
begin
  -- One lock per room: votes in a room run one after another (a few ms each),
  -- so counting and deciding never race. Rooms do not block each other.
  select * into v_room from public.rooms where id = p_room_id for no key update;
  if not found then
    raise exception 'room not found' using errcode = '42501';
  end if;

  select m.* into v_member from public.room_members m
  where m.room_id = p_room_id
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
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
      perform internal.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
    end if;
  end if;

  if p_answer in ('like', 'super_like') then
    v_check := internal.check_card_match(p_room_id, p_title_id);
    if v_check->>'match' = 'false' then
      if v_room.reveal = 'party' and (v_check->>'likes')::int >= 2 then
        perform internal.broadcast_room(p_room_id, 'near_miss', jsonb_build_object(
          'title_id', p_title_id, 'likes', v_check->'likes', 'of', v_check->'of'));
      end if;
      if v_card.like_count + v_card.super_like_count = 1 then
        v_touched := internal.propagate_like(p_room_id, p_title_id, v_member.id);
        if cardinality(v_touched) > 0 then
          perform internal.broadcast_room(p_room_id, 'deck_updated', jsonb_build_object('member_ids', to_jsonb(v_touched)));
        end if;
      end if;
    end if;
  end if;

  if v_check is null or (v_check->>'decided') is distinct from 'true' then
    v_round := internal.maybe_start_finale(p_room_id);
  end if;

  -- Ask the server for more cards when this seat is down to 15. A request
  -- older than 30 seconds is assumed lost and sent again.
  if v_round is null and (v_check is null or (v_check->>'decided') is distinct from 'true') then
    select count(*) into v_remaining
    from public.deck_entries d
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where d.room_member_id = v_member.id
      and not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id);
    if v_remaining <= 15
       and (v_member.refill_requested_at is null or v_member.refill_requested_at < now() - interval '30 seconds') then
      update public.room_members set refill_requested_at = now() where id = v_member.id;
      perform internal.enqueue('deck_requests', jsonb_build_object(
        'kind', 'refill', 'room_id', p_room_id, 'room_member_id', v_member.id));
    end if;
  end if;

  return jsonb_build_object('status', 'ok')
    || jsonb_build_object('match', coalesce(v_check->'match', 'false'::jsonb))
    || case when v_check->>'match' = 'true' then jsonb_build_object('kind', v_check->'kind', 'decided', v_check->'decided')
            else '{}'::jsonb end
    || case when v_round is not null then jsonb_build_object('finale_round_id', v_round) else '{}'::jsonb end;
end
$$;

create function api.undo_last_vote(p_room_id uuid, p_member_id uuid default null) returns jsonb
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
    and m.controlled_by in (select internal.my_profile_ids())
    and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()));
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


-- =========================================================================
-- 17. api: calibration and after the game
-- =========================================================================

-- p_answers: [{"title_id": 1, "answer": "love" | "fine" | "nope" | "not_seen"}]
create function api.submit_calibration(p_answers jsonb, p_room_id uuid default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
  v_seat uuid;
  v_saved integer;
begin
  if v_me is null then
    raise exception 'no profile for this user' using errcode = '42501';
  end if;

  insert into public.user_titles as ut (profile_id, title_id, source, seen, reaction)
  select v_me, (a->>'title_id')::bigint, 'calibration', a->>'answer' <> 'not_seen',
         case when a->>'answer' in ('love', 'fine', 'nope') then (a->>'answer')::public.reaction end
  from jsonb_array_elements(p_answers) a
  where (a->>'title_id')::bigint in (select ct.title_id from public.calibration_titles ct where ct.is_active)
    and a->>'answer' in ('love', 'fine', 'nope', 'not_seen')
  on conflict (profile_id, title_id, source) do update
    set seen = excluded.seen, reaction = excluded.reaction, updated_at = now();
  get diagnostics v_saved = row_count;

  if p_room_id is not null then
    update public.room_members set calibrated_at = now(), last_active_at = now()
    where room_id = p_room_id and profile_id = v_me
    returning id into v_seat;
    if v_seat is not null then
      perform internal.broadcast_room(p_room_id, 'seat_updated', jsonb_build_object('member_id', v_seat));
    end if;
  end if;

  perform internal.enqueue('taste_refresh', jsonb_build_object('profile_id', v_me, 'reason', 'calibration'));
  return jsonb_build_object('status', 'ok', 'saved', v_saved);
end
$$;

-- "Did you watch it?" on a later app open.
create function api.answer_followup(
  p_room_id uuid,
  p_watched public.watched_answer,
  p_reaction public.reaction default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := internal.my_profile_id();
  v_pick bigint;
begin
  update public.room_members
  set watched_answer = p_watched, post_reaction = p_reaction, followup_at = now()
  where room_id = p_room_id and profile_id = v_me
    and exists (select 1 from public.rooms r where r.id = p_room_id and r.state = 'done');
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select mt.title_id into v_pick from public.matches mt where mt.room_id = p_room_id and mt.pick_order = 1;
  if p_watched = 'yes' and v_pick is not null then
    insert into public.user_titles as ut (profile_id, title_id, source, seen, reaction, last_watched_on)
    values (v_me, v_pick, 'app', true, p_reaction, current_date)
    on conflict (profile_id, title_id, source) do update
      set seen = true, reaction = coalesce(excluded.reaction, ut.reaction),
          last_watched_on = excluded.last_watched_on, updated_at = now();
  end if;

  perform internal.enqueue('taste_refresh', jsonb_build_object('profile_id', v_me, 'reason', 'followup'));
  return jsonb_build_object('status', 'ok');
end
$$;


-- =========================================================================
-- 18. api: what the app reads
-- =========================================================================

-- Views run as the caller (security_invoker), so row-level security on the
-- tables underneath decides which rows come back.

create view api.my_profile with (security_invoker = true) as
  select p.id, p.display_name, p.avatar_key, p.country, p.language, p.created_at
  from public.profiles p where p.auth_user_id = (select auth.uid());

create view api.my_providers with (security_invoker = true) as
  select pp.provider_id from public.profile_providers pp;

create view api.country_providers with (security_invoker = true) as
  select pr.country, p.id as provider_id, p.name, p.logo_path, pr.display_priority
  from public.provider_regions pr join public.providers p on p.id = pr.provider_id;

create view api.genres with (security_invoker = true) as
  select g.id, g.slug, g.names from public.genres g where 'movie' = any (g.media_types);

create view api.moods with (security_invoker = true) as
  select m.slug, m.names, m.sort from public.moods m;

create view api.game_modes with (security_invoker = true) as
  select gm.slug, gm.min_players, gm.max_players, gm.ends_on_first_match, gm.sort from public.game_modes gm;

create view api.calibration_titles with (security_invoker = true) as
  select ct.title_id, ct.axis, ct.sort from public.calibration_titles ct;

create view api.app_config with (security_invoker = true) as
  select c.key, c.value from public.app_config c;

create view api.rooms with (security_invoker = true) as
  select r.id, r.code, r.mode, r.state, r.country, r.service_rule, r.offer_kinds, r.runtime_max,
         r.seen_rule, r.quality, r.max_age, r.reveal, r.max_players, r.provider_ids, r.stats,
         r.created_at, r.started_at, r.finale_at, r.decided_at, r.ended_at
  from public.rooms r;

create view api.room_seats with (security_invoker = true) as
  select m.id as member_id, m.room_id, m.role, m.display_name, m.avatar_key, m.provider_ids,
         m.joined_at, m.left_at, m.calibrated_at, m.done_at, m.swipe_count,
         m.super_likes_left, m.vetoes_left,
         m.profile_id is not distinct from internal.my_profile_id() as is_me,
         m.controlled_by in (select internal.my_profile_ids()) as is_mine
  from public.room_members m;

create view api.room_matches with (security_invoker = true) as
  select mt.room_id, mt.title_id, mt.kind, mt.like_count, mt.present_count, mt.pick_order, mt.created_at
  from public.matches mt;

create view api.rounds with (security_invoker = true) as
  select r.id, r.room_id, r.seq, r.kind, r.stage, r.stage_closes_at, r.opened_at, r.closed_at, r.winner_title_id
  from public.rounds r;

create view api.round_candidates with (security_invoker = true) as
  select rc.round_id, rc.title_id, rc.seed, rc.vetoed_at is not null as vetoed, rc.points
  from public.round_candidates rc;

create view api.my_votes with (security_invoker = true) as
  select v.room_id, v.room_member_id, v.title_id, v.answer, v.created_at from public.votes v;

create view api.my_linked_accounts with (security_invoker = true) as
  select la.id, la.provider, la.username, la.exported_at, la.last_synced_at,
         la.gap_detected_at is not null as needs_new_export,
         la.last_error, la.created_at
  from public.linked_accounts la;

create view api.my_imports with (security_invoker = true) as
  select i.id, i.linked_account_id, i.kind, i.status, i.films_total, i.films_matched,
         i.films_unmatched, i.started_at, i.finished_at, i.error
  from public.imports i;

create view api.my_unmatched_films with (security_invoker = true) as
  select ir.id, ir.import_id, ir.film_name, ir.film_year, ir.letterboxd_uri
  from public.import_rows ir where ir.status = 'unmatched';

-- Cards for any titles: winner screen, finale, calibration. Up to 50 at a time.
create function api.title_cards(p_title_ids bigint[], p_language text default null, p_country char(2) default null)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(cp.card order by array_position(p_title_ids, cp.title_id)), '[]')
  from internal.card_payloads(
    p_title_ids[1:50],
    coalesce(p_language, (select p.language from public.profiles p where p.id = internal.my_profile_id()), 'en'),
    coalesce(p_country, (select p.country from public.profiles p where p.id = internal.my_profile_id()))
  ) cp
$$;

-- The seat's next cards, ready to render, with tonight's services and the reason label.
create function api.my_next_cards(
  p_room_id uuid,
  p_limit integer default 10,
  p_member_id uuid default null,
  p_language text default null
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with seat as (
    select m.id, r.country, r.provider_ids
    from public.room_members m join public.rooms r on r.id = m.room_id
    where m.room_id = p_room_id
      and m.controlled_by in (select internal.my_profile_ids())
      and (m.id = p_member_id or (p_member_id is null and m.profile_id = internal.my_profile_id()))
  ),
  upcoming as (
    select d.title_id, d.sort_key, d.source, c.reason_code, c.reason_params, c.member_ratings
    from seat s
    join public.deck_entries d on d.room_member_id = s.id
    join public.room_cards c on c.room_id = d.room_id and c.title_id = d.title_id and c.state = 'active'
    where not exists (select 1 from public.votes v where v.room_member_id = d.room_member_id and v.title_id = d.title_id)
    order by d.sort_key
    limit least(greatest(p_limit, 1), 30)
  ),
  cards as (
    select cp.title_id, cp.card
    from seat s,
      internal.card_payloads(
        (select array_agg(u.title_id) from upcoming u),
        coalesce(p_language, (select p.language from public.profiles p where p.id = internal.my_profile_id()), 'en'),
        s.country, s.provider_ids) cp
  )
  select coalesce(jsonb_agg(c.card || jsonb_build_object(
           'deck_source', u.source, 'reason_code', u.reason_code,
           'reason_params', u.reason_params, 'member_ratings', u.member_ratings)
         order by u.sort_key), '[]')
  from upcoming u join cards c on c.title_id = u.title_id
$$;


-- =========================================================================
-- 19. Security: row-level security, roles and grants
-- =========================================================================

-- The recommendation server's role. Create a login for the server and grant
-- it this role; the server never uses the service role key for the database.
-- Created only if it's missing: roles belong to the whole cluster, so a second
-- database in the same cluster (two lite databases, say) finds it already there.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_server') then
    create role app_server nologin;
  end if;
end
$$;

-- Row-level security on every table. The server sees every row; phones only
-- what the policies below allow, and only through api views.
do $$
declare
  t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('public', 'rec') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format('create policy server_all on %I.%I for all to app_server using (true) with check (true)',
                   t.schemaname, t.tablename);
  end loop;
end
$$;

-- Phones: no direct table access beyond what the api views read.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema rec from public, anon, authenticated;
grant usage on schema api, internal to authenticated;
grant select on
  public.profiles, public.profile_providers, public.providers, public.provider_regions,
  public.genres, public.moods, public.game_modes, public.calibration_titles, public.app_config,
  public.rooms, public.room_members, public.matches, public.rounds, public.round_candidates,
  public.votes, public.linked_accounts, public.imports, public.import_rows
to authenticated;
grant select on all tables in schema api to authenticated;

create policy read_all on public.providers for select to authenticated using (true);
create policy read_all on public.provider_regions for select to authenticated using (true);
create policy read_all on public.genres for select to authenticated using (true);
create policy read_all on public.moods for select to authenticated using (is_active);
create policy read_all on public.game_modes for select to authenticated using (is_active);
create policy read_all on public.calibration_titles for select to authenticated using (is_active);
create policy read_all on public.app_config for select to authenticated using (true);

create policy own_read on public.profiles for select to authenticated
  using (id in (select internal.my_profile_ids()));
create policy own_read on public.profile_providers for select to authenticated
  using (profile_id = (select internal.my_profile_id()));
create policy own_read on public.linked_accounts for select to authenticated
  using (profile_id in (select internal.my_profile_ids()));
create policy own_read on public.imports for select to authenticated
  using (linked_account_id in (
    select la.id from public.linked_accounts la where la.profile_id in (select internal.my_profile_ids())));
create policy own_read on public.import_rows for select to authenticated
  using (import_id in (
    select i.id from public.imports i join public.linked_accounts la on la.id = i.linked_account_id
    where la.profile_id in (select internal.my_profile_ids())));

-- Rooms: members see the room; nobody can list rooms.
create policy member_read on public.rooms for select to authenticated
  using (internal.is_room_member(id));
create policy member_read on public.room_members for select to authenticated
  using (internal.is_room_member(room_id));
create policy member_read on public.matches for select to authenticated
  using (internal.is_room_member(room_id));
create policy member_read on public.rounds for select to authenticated
  using (internal.is_room_member(room_id));
create policy member_read on public.round_candidates for select to authenticated
  using (round_id in (select r.id from public.rounds r where internal.is_room_member(r.room_id)));

-- Your own seat's votes only. Other players' answers reach you only as the
-- counts the room's reveal mode allows.
create policy own_seat on public.votes for select to authenticated
  using (room_member_id in (
    select m.id from public.room_members m where m.controlled_by in (select internal.my_profile_ids())));

-- Realtime: phones read both room topics and send only on the :live topic.
create policy room_topics_read on realtime.messages for select to authenticated
  using (internal.can_use_room_topic((select realtime.topic()), false));
create policy room_topics_send on realtime.messages for insert to authenticated
  with check (internal.can_use_room_topic((select realtime.topic()), true));

-- The server: reads everything, writes the catalog, history, taste and its
-- own rec schema, and writes decks through internal.deal_cards.
grant usage on schema public, internal, rec to app_server;
grant select on all tables in schema public to app_server;
grant insert, update, delete on
  public.genres, public.keywords, public.people, public.providers, public.provider_regions,
  public.certification_ages, public.titles, public.title_translations, public.title_credits,
  public.title_certifications, public.title_availability, public.title_watch_links,
  public.title_deep_links, public.title_vectors, public.calibration_titles, public.ingest_runs,
  public.consents, public.linked_accounts, public.imports, public.import_rows, public.letterboxd_entries,
  public.letterboxd_film_map, public.user_titles, public.taste_profiles, public.room_models
to app_server;
grant update (stats) on public.rooms to app_server;
grant select, insert, update, delete on all tables in schema rec to app_server;
grant usage on all sequences in schema public, rec to app_server;
-- Supabase Queues: also give app_server read and delete on the queues it consumes.

-- Functions: phones call api functions; the server calls the deck functions.
revoke execute on all functions in schema api, internal from public, anon, authenticated;
grant execute on all functions in schema api to authenticated;
grant execute on function
  internal.my_profile_id(),
  internal.my_profile_ids(),
  internal.is_room_member(uuid),
  internal.can_use_room_topic(text, boolean)
to authenticated;
grant execute on function
  internal.deck_candidates(uuid, integer, real),
  internal.deal_cards(uuid, jsonb),
  internal.deal_baseline(uuid, uuid),
  internal.card_payloads(bigint[], text, char, integer[]),
  internal.broadcast_room(uuid, text, jsonb),
  internal.enqueue(text, jsonb),
  internal.start_letterboxd_import(uuid, jsonb),
  internal.finish_letterboxd_import(uuid),
  internal.apply_letterboxd_feed(uuid, jsonb, text, text)
to app_server;


-- =========================================================================
-- 20. Configuration rows (starting values from the revival plan, to tune)
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

insert into public.app_config (key, value) values
  ('min_app_version', '{"ios": "1.0.0", "android": "1.0.0"}');

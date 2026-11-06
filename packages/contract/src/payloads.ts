// Hand-written shapes for what the `api` functions return as JSON, which the generated
// types only know as `Json` (app-structure.md#talking-to-the-backend). Each schema is
// checked against real responses in development and in tests; production skips the check.
// Fields keep the SQL's snake_case names. Every list of statuses follows answers.ts and
// the latest migration; a PR that changes a function changes its schema here too.
import * as z from 'zod/mini';

import type { Json } from './database.types';
import { ANALYTICS_CHOICES } from './answers';
import { ROOM_STATES } from './realtime';

const roomState = z.enum(ROOM_STATES);

// --- Profile ---------------------------------------------------------------------------

export const updateProfileResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), display_name: z.string(), avatar_key: z.string() }),
  z.object({ status: z.enum(['invalid_name', 'name_not_allowed', 'unknown_avatar']) }),
]);
export type UpdateProfileResult = z.infer<typeof updateProfileResult>;

export const setMyProvidersResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('too_many'), max: z.number() }),
]);
export type SetMyProvidersResult = z.infer<typeof setMyProvidersResult>;

// --- Rooms and lobby -------------------------------------------------------------------

export const createRoomResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), room_id: z.string(), code: z.string() }),
  z.object({ status: z.enum(['name_required', 'unknown_mode', 'country_required']) }),
  // `field` names the setting that was refused (`settings` when the payload isn't an object).
  z.object({ status: z.literal('invalid_settings'), field: z.string() }),
]);
export type CreateRoomResult = z.infer<typeof createRoomResult>;

export const joinRoomResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    room_id: z.string(),
    member_id: z.string(),
    state: roomState,
    rejoined: z.boolean(),
  }),
  z.object({ status: z.literal('full'), max_players: z.number() }),
  z.object({ status: z.literal('name_required'), host_name: z.nullable(z.string()) }),
  z.object({
    status: z.enum([
      'not_found',
      'closed',
      'starting',
      'in_finale',
      'removed',
      'locked',
      'rate_limited',
    ]),
  }),
]);
export type JoinRoomResult = z.infer<typeof joinRoomResult>;

export const roomPreviewResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    state: z.enum(['lobby', 'dealing', 'swiping']),
    host_name: z.nullable(z.string()),
    host_avatar_key: z.nullable(z.string()),
    players: z.number(),
    max_players: z.number(),
    seated: z.boolean(),
  }),
  z.object({ status: z.literal('full'), max_players: z.number() }),
  z.object({ status: z.enum(['closed', 'removed', 'locked', 'in_finale', 'rate_limited']) }),
]);
export type RoomPreviewResult = z.infer<typeof roomPreviewResult>;

export const reportMemberResult = z.object({
  status: z.enum(['ok', 'not_in_room', 'rate_limited']),
});
export type ReportMemberResult = z.infer<typeof reportMemberResult>;

// The first release's export (M8.6). Only the caller's own data: their seats, never other seats,
// and no reports. The Letterboxd lists are empty in the first release. Dates are ISO strings.
const exportVote = z.object({
  tmdb_id: z.number(),
  title: z.string(),
  answer: z.string(),
  at: z.string(),
});
const exportSwipe = z.object({
  tmdb_id: z.number(),
  action: z.enum(['vote', 'undo']),
  answer: z.string(),
  at: z.string(),
  dwell_ms: z.nullable(z.number()),
});
const exportBallot = z.object({
  tmdb_id: z.nullable(z.number()),
  kind: z.enum(['veto', 'pass', 'rank']),
  rank: z.nullable(z.number()),
  at: z.string(),
});
export const exportGame = z.object({
  room_id: z.string(),
  mode: z.string(),
  joined_at: z.string(),
  left_at: z.nullable(z.string()),
  display_name: z.string(),
  avatar_key: z.string(),
  role: z.enum(['host', 'guest']),
  joined_via: z.nullable(z.string()),
  services: z.array(z.number()),
  votes: z.array(exportVote),
  swipes: z.array(exportSwipe),
  ballots: z.array(exportBallot),
  pick: z.nullable(z.object({ tmdb_id: z.number(), title: z.string(), kind: z.string() })),
  watched_answer: z.nullable(z.string()),
  post_reaction: z.nullable(z.string()),
});
export type ExportGame = z.infer<typeof exportGame>;

export const exportMyData = z.object({
  profile: z.nullable(z.record(z.string(), z.unknown())),
  services: z.array(z.number()),
  consents: z.array(z.record(z.string(), z.unknown())),
  linked_accounts: z.array(z.unknown()),
  letterboxd_diary: z.array(z.unknown()),
  film_history: z.array(
    z.object({
      tmdb_id: z.number(),
      title: z.string(),
      source: z.string(),
      seen: z.boolean(),
      rating: z.nullable(z.number()),
      on_watchlist: z.boolean(),
      reaction: z.nullable(z.string()),
      last_watched_on: z.nullable(z.string()),
      liked_at: z.nullable(z.string()),
      super_liked: z.boolean(),
      picked_at: z.nullable(z.string()),
      seen_at: z.nullable(z.string()),
      saved_at: z.nullable(z.string()),
    }),
  ),
  taste: z.nullable(z.unknown()),
  games: z.array(exportGame),
});
export type ExportMyData = z.infer<typeof exportMyData>;

export const exportMyDataResult = z.discriminatedUnion('status', [
  z.extend(exportMyData, { status: z.literal('ok') }),
  z.object({ status: z.literal('rate_limited') }),
]);
export type ExportMyDataResult = z.infer<typeof exportMyDataResult>;

export const setAnalyticsChoiceResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), choice: z.enum(ANALYTICS_CHOICES) }),
  z.object({ status: z.literal('invalid') }),
  z.object({ status: z.literal('rate_limited') }),
]);
export type SetAnalyticsChoiceResult = z.infer<typeof setAnalyticsChoiceResult>;

export const leaveRoomResult = z.object({ status: z.enum(['ok', 'not_in_room']) });
export type LeaveRoomResult = z.infer<typeof leaveRoomResult>;

export const removeMemberResult = z.object({ status: z.enum(['ok', 'not_in_room', 'closed']) });
export type RemoveMemberResult = z.infer<typeof removeMemberResult>;

// ok carries the saved value.
export const setRoomLockedResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), locked: z.boolean() }),
  z.object({ status: z.literal('closed') }),
]);
export type SetRoomLockedResult = z.infer<typeof setRoomLockedResult>;

// ok carries the next room: the new one, or the open one on a repeat call (M6.22).
export const playAgainResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), room_id: z.string(), code: z.string() }),
  z.object({ status: z.literal('not_finished') }),
  z.object({ status: z.literal('unknown_mode') }),
  z.object({ status: z.literal('name_required') }),
]);
export type PlayAgainResult = z.infer<typeof playAgainResult>;

// After the pick (M6.48). `likers` is present only in Party and never holds a seat that did not like
// the film; Blind carries `likes` only. Nothing about nopes, seens or a total of seats.
export const runnerUp = z.object({
  title_id: z.number(),
  likes: z.number(),
  likers: z.optional(
    z.array(z.object({ member_id: z.string(), display_name: z.string(), avatar_key: z.string() })),
  ),
});
export type RunnerUp = z.infer<typeof runnerUp>;
export const runnersUpResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    reveal: z.enum(['party', 'blind']),
    source: z.nullable(z.enum(['finalists', 'most_liked'])),
    runners_up: z.array(runnerUp),
  }),
  z.object({ status: z.literal('not_finished') }),
]);
export type RunnersUpResult = z.infer<typeof runnersUpResult>;

/** The host's settings: any subset; `runtime_max` and `max_age` take null to clear. */
export type RoomSettings = {
  service_rule?: 'any_member' | 'every_member';
  runtime_max?: number | null;
  seen_rule?: 'hide_seen' | 'allow_rewatch' | 'show_all';
  quality?: 'standard' | 'hidden_gems' | 'guilty_pleasures';
  max_age?: number | null;
  reveal?: 'party' | 'blind';
};

export const updateRoomSettingsResult = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['ok', 'closed']) }),
  // `field` names the setting that was refused (`settings` when the payload isn't an object).
  z.object({ status: z.literal('invalid_settings'), field: z.string() }),
]);
export type UpdateRoomSettingsResult = z.infer<typeof updateRoomSettingsResult>;

export const setSeatPrefsResult = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['ok', 'closed', 'unknown_genre', 'locked']) }),
  z.object({
    status: z.literal('too_many'),
    field: z.enum(['provider_ids', 'mood_slugs', 'genre_ids']),
    max: z.number(),
  }),
]);
export type SetSeatPrefsResult = z.infer<typeof setSeatPrefsResult>;

/**
 * `api.room_genres` (M6.53): `options` are the genres offered tonight (30 eligible films or more,
 * never TV Movie) in genre id order, each with how many present seats picked it; `mine` is the
 * caller's own picks. Counts only: never a seat or a name.
 */
export const roomGenresResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    options: z.array(z.object({ genre_id: z.number(), count: z.number() })),
    mine: z.array(z.number()),
  }),
]);
export type RoomGenresResult = z.infer<typeof roomGenresResult>;

// The `api.genres` view: a TMDB genre with its names by language.
export const genreRow = z.object({
  id: z.number(),
  slug: z.string(),
  names: z.object({ fr: z.optional(z.string()), en: z.optional(z.string()) }),
});
export const genresSchema = z.array(genreRow);
export type Genre = z.infer<typeof genreRow>;

export const startGameResult = z.discriminatedUnion('status', [
  // Under deck_engine `sql` the start deals at once (`ok`); `fallback` marks the 8-second path.
  z.object({
    status: z.literal('ok'),
    // A bigint in SQL: a number once a start went through, null when nothing was dealt.
    request_id: z.nullish(z.union([z.string(), z.number()])),
    started: z.optional(z.boolean()),
    seats: z.optional(z.number()),
    fallback: z.optional(z.boolean()),
  }),
  z.object({ status: z.literal('dealing') }),
  // `state` is missing when the room moved on while it was being dealt.
  z.object({ status: z.literal('closed'), state: z.optional(roomState) }),
  z.object({ status: z.literal('not_enough_players'), need: z.number() }),
  // Fewer than 20 films fit tonight's filters: the room is back in the lobby (M5.5).
  z.object({
    status: z.literal('too_few_films'),
    eligible: z.number(),
    fallback: z.optional(z.boolean()),
  }),
]);
export type StartGameResult = z.infer<typeof startGameResult>;

/**
 * `api.start_solo` (M6.40). `ok` is swiping already; `dealing` waits for the deck worker. The room
 * of a `too_few_films` answer is abandoned and not returned. `field` names the refused setting.
 */
export const startSoloResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    room_id: z.string(),
    member_id: z.string(),
    state: z.literal('swiping'),
  }),
  z.object({ status: z.literal('dealing'), room_id: z.string(), member_id: z.string() }),
  z.object({ status: z.literal('invalid_settings'), field: z.string() }),
  z.object({ status: z.literal('too_few_films'), eligible: z.number() }),
  z.object({
    status: z.enum(['name_required', 'country_required', 'rate_limited', 'daily_limit']),
  }),
]);
export type StartSoloResult = z.infer<typeof startSoloResult>;

/** `api.solo_pick` (M6.40). */
export const soloPickResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), title_id: z.number() }),
  z.object({ status: z.literal('not_liked') }),
  z.object({ status: z.literal('closed'), state: roomState }),
]);
export type SoloPickResult = z.infer<typeof soloPickResult>;

// --- Swiping ---------------------------------------------------------------------------

const matchKind = z.enum(['unanimous', 'majority', 'finale']);

/**
 * `api.cast_vote`. `match` is always there on `ok`; `kind` and `decided` only when it is a match,
 * `finale_round_id` only when this vote opened the finale. M6.2 adds an argument, not an answer.
 */
export const castVoteResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    match: z.boolean(),
    kind: z.optional(matchKind),
    decided: z.optional(z.boolean()),
    finale_round_id: z.optional(z.string()),
    /** The room's state, only when this vote left it no longer swiping (M6.29). */
    state: z.optional(roomState),
  }),
  z.object({ status: z.literal('closed'), state: roomState }),
  z.object({ status: z.enum(['duplicate', 'dropped', 'no_super_likes']) }),
]);
export type CastVoteResult = z.infer<typeof castVoteResult>;

/** `api.cast_ballot` (M6.5): `locked` is seat ids, `of` the seats present. */
export const castBallotResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), locked: z.array(z.string()), of: z.number() }),
  z.object({
    status: z.enum(['not_in_room', 'closed', 'already_voted', 'invalid', 'no_veto']),
  }),
]);
export type CastBallotResult = z.infer<typeof castBallotResult>;

/** `api.close_round_stage` (M6.5). */
export const closeRoundStageResult = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['ok', 'closed']), winner_title_id: z.number() }),
  z.object({ status: z.literal('not_yet'), closes_at: z.string() }),
]);
export type CloseRoundStageResult = z.infer<typeof closeRoundStageResult>;

/** `api.round_progress` (M6.5). `stage` is `vote` while open, `closed` after. */
export const roundProgressResult = z.object({
  status: z.literal('ok'),
  stage: z.enum(['veto', 'rank', 'vote', 'closed']),
  closes_at: z.string(),
  locked: z.array(z.string()),
  of: z.number(),
  me_locked: z.boolean(),
});
export type RoundProgressResult = z.infer<typeof roundProgressResult>;

/** `api.request_cards`: `ok` carries the deal's counts when cards were dealt now. */
export const requestCardsResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    started: z.optional(z.boolean()),
    seats: z.optional(z.number()),
    fallback: z.optional(z.boolean()),
  }),
  z.object({ status: z.literal('queued') }),
  z.object({ status: z.literal('enough'), remaining: z.number() }),
  z.object({ status: z.literal('closed'), state: roomState }),
  z.object({ status: z.literal('done'), liked: z.number() }),
  z.object({ status: z.literal('daily_limit') }),
]);
export type RequestCardsResult = z.infer<typeof requestCardsResult>;

export const undoLastVoteResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), title_id: z.number() }),
  z.object({ status: z.enum(['closed', 'nothing_to_undo', 'locked']) }),
]);
export type UndoLastVoteResult = z.infer<typeof undoLastVoteResult>;

/** A row of `api.room_matches`: a film the room agreed on. */
export const roomMatchRow = z.object({
  room_id: z.string(),
  title_id: z.number(),
  kind: matchKind,
  like_count: z.number(),
  present_count: z.number(),
  pick_order: z.nullable(z.number()),
  created_at: z.string(),
});
export type RoomMatch = z.infer<typeof roomMatchRow>;

/** A row of `api.rounds`: one Final Cut or ranked vote of the room. */
export const roomRoundRow = z.object({
  id: z.string(),
  room_id: z.string(),
  seq: z.number(),
  kind: z.enum(['final_cut', 'ranked_vote']),
  stage: z.enum(['veto', 'rank', 'vote', 'closed']),
  stage_closes_at: z.string(),
  opened_at: z.string(),
  closed_at: z.nullable(z.string()),
  winner_title_id: z.nullable(z.number()),
});
export type RoomRound = z.infer<typeof roomRoundRow>;

/** A row of `api.round_candidates`: a finalist. `points` and `vetoed` stay 0 and false until the round closes. */
export const roundCandidateRow = z.object({
  round_id: z.string(),
  title_id: z.number(),
  seed: z.number(),
  points: z.number(),
  vetoed: z.nullable(z.boolean()),
});
export type RoundCandidate = z.infer<typeof roundCandidateRow>;

// --- Views -----------------------------------------------------------------------------

/** The `app_config` keys the app reads. Unknown keys are ignored, missing ones are undefined. */
export type AppConfig = {
  min_app_version?: { ios: string; android: string };
  tmdb_image_base?: string;
  /** The invite page's https origin (from M4.18). Missing: invites use the build's scheme. */
  invite_base_url?: string;
  /** The policy, terms and deletion links and the support address (M8.12). Parse with `parseLegalUrls`. */
  legal_urls?: unknown;
};

const perLanguage = z.object({ fr: z.string(), en: z.string() });
export const legalUrlsSchema = z.object({
  privacy: perLanguage,
  terms: perLanguage,
  deletion: perLanguage,
  support_email: z.string(),
});
export type LegalUrls = z.infer<typeof legalUrlsSchema>;

/** The legal links from `app_config.legal_urls`, or null when missing or malformed (the app hides the rows then). */
export function parseLegalUrls(value: unknown): LegalUrls | null {
  const parsed = legalUrlsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const appConfigSchema = z.object({
  min_app_version: z.optional(z.object({ ios: z.string(), android: z.string() })),
  tmdb_image_base: z.optional(z.string()),
  invite_base_url: z.optional(z.string()),
  legal_urls: z.optional(z.unknown()),
});

export const myProfileRow = z.object({
  id: z.string(),
  display_name: z.string(),
  avatar_key: z.string(),
  country: z.nullable(z.string()),
  language: z.string(),
  created_at: z.string(),
});
export type MyProfile = z.infer<typeof myProfileRow>;

// The `api.rooms` view: what a member of the room reads about it.
export const roomRow = z.object({
  id: z.string(),
  code: z.string(),
  mode: z.string(),
  state: roomState,
  country: z.string(),
  service_rule: z.enum(['any_member', 'every_member']),
  offer_kinds: z.array(z.enum(['subscription', 'free', 'ads', 'rent', 'buy'])),
  runtime_max: z.nullable(z.number()),
  seen_rule: z.enum(['hide_seen', 'allow_rewatch', 'show_all']),
  quality: z.enum(['standard', 'hidden_gems', 'guilty_pleasures']),
  max_age: z.nullable(z.number()),
  reveal: z.enum(['party', 'blind']),
  max_players: z.number(),
  provider_ids: z.array(z.number()),
  stats: z.nullable(z.unknown()),
  created_at: z.string(),
  started_at: z.nullable(z.string()),
  finale_at: z.nullable(z.string()),
  decided_at: z.nullable(z.string()),
  ended_at: z.nullable(z.string()),
  locked: z.boolean(),
  // Play again (M6.22): the next room's id once the host opened it; its code while that room is open.
  next_room_id: z.nullable(z.string()),
  next_room_code: z.nullable(z.string()),
});
export type RoomRow = Omit<z.infer<typeof roomRow>, 'stats'> & { stats: Json | null };

// The `api.room_seats` view: one row per seat of the room, including seats that left.
export const roomSeatRow = z.object({
  member_id: z.string(),
  room_id: z.string(),
  role: z.enum(['host', 'guest']),
  display_name: z.string(),
  avatar_key: z.string(),
  provider_ids: z.array(z.number()),
  joined_at: z.string(),
  left_at: z.nullable(z.string()),
  calibrated_at: z.nullable(z.string()),
  done_at: z.nullable(z.string()),
  swipe_count: z.number(),
  // Null on seats the caller does not control: a spent veto must not show who vetoed (M6.5).
  super_likes_left: z.nullable(z.number()),
  vetoes_left: z.nullable(z.number()),
  is_me: z.nullable(z.boolean()),
  is_mine: z.nullable(z.boolean()),
});
export type RoomSeat = z.infer<typeof roomSeatRow>;

export const countryProviderRow = z.object({
  provider_id: z.number(),
  name: z.string(),
  logo_path: z.nullable(z.string()),
  display_priority: z.number(),
});
export const countryProvidersSchema = z.array(countryProviderRow);
export type CountryProvider = z.infer<typeof countryProviderRow>;

// The `api.catalog_countries` view: the countries that have a catalog (the country choice).
export const catalogCountryRow = z.object({ code: z.string(), default_language: z.string() });
export const catalogCountriesSchema = z.array(catalogCountryRow);
export type CatalogCountry = z.infer<typeof catalogCountryRow>;

// The `api.game_modes` view: the rules of each mode that the phone needs before a game.
export const gameModeRow = z.object({
  slug: z.string(),
  min_players: z.number(),
  max_players: z.number(),
  ends_on_first_match: z.boolean(),
  sort: z.number(),
  matches_to_end: z.number(),
});
export const gameModesSchema = z.array(gameModeRow);
export type GameMode = z.infer<typeof gameModeRow>;

// A card as `api.my_next_cards` sends it (data-model.md#the-apps-api): everything the card stack
// draws, front and back, from one call. Paths only; phones build URLs from tmdb_image_base.
// No like, nope or seen counts, scores or fits: nobody sees who noped a film.
export const OFFER_KINDS = ['subscription', 'free', 'ads', 'rent', 'buy'] as const;
export const cardProviderRow = z.object({
  provider_id: z.number(),
  kind: z.enum(OFFER_KINDS),
  name: z.string(),
  logo_path: z.nullable(z.string()),
});
export const cardRow = z.object({
  title_id: z.number(),
  tmdb_id: z.number(),
  title: z.string(),
  overview: z.nullable(z.string()),
  year: z.nullable(z.number()),
  runtime_min: z.nullable(z.number()),
  genre_ids: z.array(z.number()),
  tmdb_score: z.nullable(z.number()),
  tmdb_votes: z.number(),
  poster_path: z.nullable(z.string()),
  poster_placeholder: z.nullable(z.string()),
  backdrop_path: z.nullable(z.string()),
  trailer_key: z.nullable(z.string()),
  directors: z.array(z.string()),
  cast: z.array(z.string()),
  providers: z.array(cardProviderRow),
  watch_link: z.nullable(z.string()),
});
export type Card = z.infer<typeof cardRow>;

export const DECK_SOURCES = ['opening', 'ranked', 'propagated', 'wildcard'] as const;
export const nextCardRow = z.object({
  ...cardRow.shape,
  deck_source: z.enum(DECK_SOURCES),
  reason_code: z.nullable(z.string()),
  reason_params: z.record(z.string(), z.unknown()),
  member_ratings: z.array(z.object({ member_id: z.string(), rating: z.number() })),
});
export type NextCard = z.infer<typeof nextCardRow>;

/** `api.my_next_cards` answers an array of cards, with no status. */
export const myNextCardsResult = z.array(nextCardRow);

/** One tile of My films: `at` is the film's latest time under the segment (for a saved film, when it was saved). */
export const myFilmTile = z.object({
  title_id: z.number(),
  title: z.string(),
  year: z.nullable(z.number()),
  poster_path: z.nullable(z.string()),
  is_picked: z.boolean(),
  is_super_liked: z.boolean(),
  at: z.string(),
});
export type MyFilmTile = z.infer<typeof myFilmTile>;

/** `api.my_films`: a page of 60 films, newest first; `next_cursor` is opaque, null on the last page. */
export const myFilmsResult = z.object({
  status: z.literal('ok'),
  films: z.array(myFilmTile),
  next_cursor: z.nullable(z.string()),
});
export type MyFilmsResult = z.infer<typeof myFilmsResult>;

/** `api.my_film_card`: the film sheet's card, and whether the caller marked it seen and liked it (a saved film is liked). */
export const myFilmCardResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    card: cardRow,
    seen: z.boolean(),
    liked: z.boolean(),
  }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('rate_limited') }),
]);
export type MyFilmCardResult = z.infer<typeof myFilmCardResult>;

/** `api.set_film_seen`, `api.remove_my_film` and `api.set_film_saved`. */
export const myFilmEditResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok') }),
  z.object({ status: z.literal('not_found') }),
  z.object({ status: z.literal('rate_limited') }),
]);
export type MyFilmEditResult = z.infer<typeof myFilmEditResult>;

/** `api.title_cards`: the room's films as cards, in the order asked; other films are left out. */
export const titleCardsResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), cards: z.array(cardRow) }),
  z.object({ status: z.literal('too_many'), max: z.number() }),
  z.object({ status: z.literal('rate_limited') }),
]);
export type TitleCardsResult = z.infer<typeof titleCardsResult>;

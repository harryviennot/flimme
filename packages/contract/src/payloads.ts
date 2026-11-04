// Hand-written shapes for what the `api` functions return as JSON, which the generated
// types only know as `Json` (app-structure.md#talking-to-the-backend). Each schema is
// checked against real responses in development and in tests; production skips the check.
// Fields keep the SQL's snake_case names. Every list of statuses follows answers.ts and
// the latest migration; a PR that changes a function changes its schema here too.
import * as z from 'zod/mini';

import type { Json } from './database.types';
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
  z.object({ status: z.enum(['ok', 'closed']) }),
  z.object({
    status: z.literal('too_many'),
    field: z.enum(['provider_ids', 'mood_slugs', 'genre_ids']),
    max: z.number(),
  }),
]);
export type SetSeatPrefsResult = z.infer<typeof setSeatPrefsResult>;

export const startGameResult = z.discriminatedUnion('status', [
  // Under deck_engine `sql` the start deals at once (`ok`); `fallback` marks the 8-second path.
  z.object({
    status: z.literal('ok'),
    request_id: z.nullish(z.string()),
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

// --- Views -----------------------------------------------------------------------------

/** The `app_config` keys the app reads. Unknown keys are ignored, missing ones are undefined. */
export type AppConfig = {
  min_app_version?: { ios: string; android: string };
  tmdb_image_base?: string;
  /** The invite page's https origin (from M4.18). Missing: invites use the build's scheme. */
  invite_base_url?: string;
};

export const appConfigSchema = z.object({
  min_app_version: z.optional(z.object({ ios: z.string(), android: z.string() })),
  tmdb_image_base: z.optional(z.string()),
  invite_base_url: z.optional(z.string()),
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

// The `api.game_modes` view: the rules of each mode that the phone needs before a game.
export const gameModeRow = z.object({
  slug: z.string(),
  min_players: z.number(),
  max_players: z.number(),
  ends_on_first_match: z.boolean(),
  sort: z.number(),
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

/** `api.title_cards`: the room's films as cards, in the order asked; other films are left out. */
export const titleCardsResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), cards: z.array(cardRow) }),
  z.object({ status: z.literal('too_many'), max: z.number() }),
  z.object({ status: z.literal('rate_limited') }),
]);
export type TitleCardsResult = z.infer<typeof titleCardsResult>;

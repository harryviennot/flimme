// Hand-written shapes for what the `api` functions return as JSON, which the generated
// types only know as `Json` (app-structure.md#talking-to-the-backend). Each schema is
// checked against real responses in development and in tests; production skips the check.
// Fields keep the SQL's snake_case names. Every list of statuses follows answers.ts and
// the latest migration; a PR that changes a function changes its schema here too.
import * as z from 'zod/mini';

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
    status: z.enum(['not_found', 'closed', 'starting', 'in_finale', 'rate_limited']),
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
  z.object({ status: z.enum(['closed', 'in_finale', 'rate_limited']) }),
]);
export type RoomPreviewResult = z.infer<typeof roomPreviewResult>;

export const leaveRoomResult = z.object({ status: z.enum(['ok', 'not_in_room']) });
export type LeaveRoomResult = z.infer<typeof leaveRoomResult>;

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
]);
export type StartGameResult = z.infer<typeof startGameResult>;

// --- Views -----------------------------------------------------------------------------

/** The `app_config` keys the app reads. Unknown keys are ignored, missing ones are undefined. */
export type AppConfig = {
  min_app_version?: { ios: string; android: string };
  tmdb_image_base?: string;
};

export const appConfigSchema = z.object({
  min_app_version: z.optional(z.object({ ios: z.string(), android: z.string() })),
  tmdb_image_base: z.optional(z.string()),
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

export const countryProviderRow = z.object({
  provider_id: z.number(),
  name: z.string(),
  logo_path: z.nullable(z.string()),
  display_priority: z.number(),
});
export const countryProvidersSchema = z.array(countryProviderRow);
export type CountryProvider = z.infer<typeof countryProviderRow>;

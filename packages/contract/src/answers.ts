// Statuses are answers, not errors (app-structure.md#talking-to-the-backend). Each one
// has a message or a behaviour in the app; a test walks every answer so none is missed.
// Each list follows the latest SQL: when a function changes, its list changes in the same
// PR. Answers a roadmap task will add sit in a `PLANNED_*` list naming that task, and move
// into the real list when the SQL lands.

/** `api.create_room` answers. */
export const CREATE_ROOM_ANSWERS = [
  'ok',
  'name_required',
  'unknown_mode',
  'country_required',
] as const;
export type CreateRoomAnswer = (typeof CREATE_ROOM_ANSWERS)[number];

/** `api.join_room` answers. */
export const JOIN_ROOM_ANSWERS = [
  'ok',
  'not_found',
  'full',
  'starting',
  'in_finale',
  'name_required',
  'rate_limited',
] as const;
export type JoinRoomAnswer = (typeof JOIN_ROOM_ANSWERS)[number];
/** Planned: `closed` is a stale invite link (roadmap M4.1). */
export const PLANNED_JOIN_ROOM_ANSWERS = ['closed'] as const;

/** `api.leave_room` answers. */
export const LEAVE_ROOM_ANSWERS = ['ok', 'not_in_room'] as const;
export type LeaveRoomAnswer = (typeof LEAVE_ROOM_ANSWERS)[number];

/** `api.update_room_settings` answers. */
export const UPDATE_ROOM_SETTINGS_ANSWERS = ['ok', 'closed'] as const;
export type UpdateRoomSettingsAnswer = (typeof UPDATE_ROOM_SETTINGS_ANSWERS)[number];

/** `api.set_seat_prefs` answers. */
export const SET_SEAT_PREFS_ANSWERS = ['ok', 'closed'] as const;
export type SetSeatPrefsAnswer = (typeof SET_SEAT_PREFS_ANSWERS)[number];

/** `api.start_game` answers. */
export const START_GAME_ANSWERS = ['dealing', 'closed', 'not_enough_players'] as const;
export type StartGameAnswer = (typeof START_GAME_ANSWERS)[number];

/** `api.request_cards` answers. */
export const REQUEST_CARDS_ANSWERS = ['queued', 'enough', 'closed'] as const;
export type RequestCardsAnswer = (typeof REQUEST_CARDS_ANSWERS)[number];

/** `api.cast_vote` answers. */
export const CAST_VOTE_ANSWERS = [
  'ok',
  'duplicate',
  'closed',
  'dropped',
  'no_super_likes',
] as const;
export type CastVoteAnswer = (typeof CAST_VOTE_ANSWERS)[number];

/** `api.undo_last_vote` answers. */
export const UNDO_LAST_VOTE_ANSWERS = ['ok', 'closed', 'nothing_to_undo', 'locked'] as const;
export type UndoLastVoteAnswer = (typeof UNDO_LAST_VOTE_ANSWERS)[number];

/** `api.update_profile` answers. */
export const UPDATE_PROFILE_ANSWERS = ['ok', 'invalid_name'] as const;
export type UpdateProfileAnswer = (typeof UPDATE_PROFILE_ANSWERS)[number];

/** `api.set_my_providers` answers. */
export const SET_MY_PROVIDERS_ANSWERS = ['ok'] as const;
export type SetMyProvidersAnswer = (typeof SET_MY_PROVIDERS_ANSWERS)[number];

/** `api.disconnect_letterboxd` answers. */
export const DISCONNECT_LETTERBOXD_ANSWERS = ['ok', 'not_linked'] as const;
export type DisconnectLetterboxdAnswer = (typeof DISCONNECT_LETTERBOXD_ANSWERS)[number];

/** `api.submit_calibration` answers. */
export const SUBMIT_CALIBRATION_ANSWERS = ['ok'] as const;
export type SubmitCalibrationAnswer = (typeof SUBMIT_CALIBRATION_ANSWERS)[number];

/** `api.answer_followup` answers. */
export const ANSWER_FOLLOWUP_ANSWERS = ['ok', 'not_found'] as const;
export type AnswerFollowupAnswer = (typeof ANSWER_FOLLOWUP_ANSWERS)[number];

/**
 * Planned: `api.cast_ballot` (roadmap M6.5, game-modes.md#apicast_ballotround-ranking-veto).
 * No SQL function yet, so there is no real list.
 */
export const PLANNED_CAST_BALLOT_ANSWERS = [
  'ok',
  'not_in_room',
  'closed',
  'already_voted',
  'invalid',
  'no_veto',
] as const;

/** The answers on a card the database accepts today (the `vote_answer` enum). */
export const VOTE_ANSWERS = ['nope', 'like', 'super_like', 'seen'] as const;
export type VoteAnswer = (typeof VOTE_ANSWERS)[number];
/** Planned: `seen_rewatch` in rooms that allow rewatches (roadmap M6.2). */
export const PLANNED_VOTE_ANSWERS = ['seen_rewatch'] as const;

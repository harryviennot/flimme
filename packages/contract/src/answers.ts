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
  'invalid_settings',
] as const;
export type CreateRoomAnswer = (typeof CREATE_ROOM_ANSWERS)[number];

/**
 * `api.join_room` answers. `closed` is a stale invite link (M4.1); `removed` is a seat the host
 * removed (M4.2); `locked` is a room the host locked, for a caller with no seat (M4.23).
 */
export const JOIN_ROOM_ANSWERS = [
  'ok',
  'not_found',
  'closed',
  'full',
  'starting',
  'in_finale',
  'removed',
  'locked',
  'name_required',
  'rate_limited',
] as const;
export type JoinRoomAnswer = (typeof JOIN_ROOM_ANSWERS)[number];

/** `api.room_preview` answers (M4.19, `removed` M4.2, `locked` M4.23). */
export const ROOM_PREVIEW_ANSWERS = [
  'ok',
  'closed',
  'removed',
  'locked',
  'full',
  'in_finale',
  'rate_limited',
] as const;
export type RoomPreviewAnswer = (typeof ROOM_PREVIEW_ANSWERS)[number];

/** How a seat came in (`public.join_via`, M4.1); sent as `via`, stored on the seat. */
export const JOIN_VIAS = ['link', 'code', 'qr', 'rejoin', 'play_again'] as const;
export type JoinVia = (typeof JOIN_VIAS)[number];

/** Why a player reported a seat (`public.report_reason`, M7.1). No free text. */
export const REPORT_REASONS = ['offensive_name', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** `api.report_member` answers (M7.1). A repeat report answers `ok` and writes nothing. */
export const REPORT_MEMBER_ANSWERS = ['ok', 'not_in_room', 'rate_limited'] as const;
export type ReportMemberAnswer = (typeof REPORT_MEMBER_ANSWERS)[number];

/** `api.leave_room` answers. */
export const LEAVE_ROOM_ANSWERS = ['ok', 'not_in_room'] as const;
export type LeaveRoomAnswer = (typeof LEAVE_ROOM_ANSWERS)[number];

/** `api.remove_member` answers (M4.2): the host removes a player. */
export const REMOVE_MEMBER_ANSWERS = ['ok', 'not_in_room', 'closed'] as const;
export type RemoveMemberAnswer = (typeof REMOVE_MEMBER_ANSWERS)[number];

/** `api.set_room_locked` answers (M4.23): the host locks or unlocks the room. */
export const SET_ROOM_LOCKED_ANSWERS = ['ok', 'closed'] as const;
export type SetRoomLockedAnswer = (typeof SET_ROOM_LOCKED_ANSWERS)[number];

/** `api.update_room_settings` answers. */
export const UPDATE_ROOM_SETTINGS_ANSWERS = ['ok', 'closed', 'invalid_settings'] as const;
export type UpdateRoomSettingsAnswer = (typeof UPDATE_ROOM_SETTINGS_ANSWERS)[number];

/** `api.set_seat_prefs` answers. */
export const SET_SEAT_PREFS_ANSWERS = ['ok', 'closed', 'too_many'] as const;
export type SetSeatPrefsAnswer = (typeof SET_SEAT_PREFS_ANSWERS)[number];

/**
 * `api.start_game` answers. `ok` means the SQL baseline dealt and the game started:
 * at once under `deck_engine` `sql` (M1.13), or the 8-second fallback (with `fallback`).
 * The app treats it like `dealing` and follows `state_changed`. `too_few_films` (with `eligible`)
 * means fewer than 20 films fit and the room is back in the lobby (M5.5).
 */
export const START_GAME_ANSWERS = [
  'ok',
  'dealing',
  'closed',
  'not_enough_players',
  'too_few_films',
] as const;
export type StartGameAnswer = (typeof START_GAME_ANSWERS)[number];

/**
 * `api.request_cards` answers. `ok` means cards were dealt now: under `deck_engine`
 * `sql` (M1.13), or the 8-second fallback (with `fallback`). `done` (M6.29): the seat has no card
 * left and the baseline dealt it nothing; `liked` counts the room's films with a like.
 */
export const REQUEST_CARDS_ANSWERS = ['ok', 'queued', 'enough', 'closed', 'done'] as const;
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
export const UPDATE_PROFILE_ANSWERS = [
  'ok',
  'invalid_name',
  'name_not_allowed',
  'unknown_avatar',
] as const;
export type UpdateProfileAnswer = (typeof UPDATE_PROFILE_ANSWERS)[number];

/** `api.set_my_providers` answers. */
export const SET_MY_PROVIDERS_ANSWERS = ['ok', 'too_many'] as const;
export type SetMyProvidersAnswer = (typeof SET_MY_PROVIDERS_ANSWERS)[number];

/** `api.disconnect_letterboxd` answers. */
export const DISCONNECT_LETTERBOXD_ANSWERS = ['ok', 'not_linked'] as const;
export type DisconnectLetterboxdAnswer = (typeof DISCONNECT_LETTERBOXD_ANSWERS)[number];

/** `api.submit_calibration` answers. */
export const SUBMIT_CALIBRATION_ANSWERS = ['ok', 'rate_limited'] as const;
export type SubmitCalibrationAnswer = (typeof SUBMIT_CALIBRATION_ANSWERS)[number];

/** `api.export_my_data` answers: `ok` comes with the data, `rate_limited` is one export per hour. */
export const EXPORT_MY_DATA_ANSWERS = ['ok', 'rate_limited'] as const;
export type ExportMyDataAnswer = (typeof EXPORT_MY_DATA_ANSWERS)[number];

/** The analytics choice (M8.12): on is the region's default mode, off the opt-out, detailed the opt-in to identified stats. */
export const ANALYTICS_CHOICES = ['on', 'off', 'detailed'] as const;
export type AnalyticsChoice = (typeof ANALYTICS_CHOICES)[number];

/** `api.set_analytics_choice` answers: `invalid` is a wording version outside 1 to 40 characters, `rate_limited` 20 an hour. */
export const SET_ANALYTICS_CHOICE_ANSWERS = ['ok', 'invalid', 'rate_limited'] as const;
export type SetAnalyticsChoiceAnswer = (typeof SET_ANALYTICS_CHOICE_ANSWERS)[number];

/**
 * `api.title_cards` answers (M5.9): `ok` comes with the cards, `too_many` with `max` (50 films a call,
 * refused and not truncated), `rate_limited` is 30 calls per 10 minutes. A caller with no seat in the
 * room raises (denied), it is not an answer.
 */
export const TITLE_CARDS_ANSWERS = ['ok', 'too_many', 'rate_limited'] as const;
export type TitleCardsAnswer = (typeof TITLE_CARDS_ANSWERS)[number];

/** `api.answer_followup` answers. */
export const ANSWER_FOLLOWUP_ANSWERS = ['ok', 'not_found'] as const;
export type AnswerFollowupAnswer = (typeof ANSWER_FOLLOWUP_ANSWERS)[number];

/**
 * `api.cast_ballot` answers (M6.5). `ok` carries `locked` (the seats that have locked in) and `of`
 * (the seats present), never what anyone voted. A round that doesn't exist, or a caller with no seat
 * in the room, raises (denied): it is not an answer.
 */
export const CAST_BALLOT_ANSWERS = [
  'ok',
  'not_in_room',
  'closed',
  'already_voted',
  'invalid',
  'no_veto',
] as const;
export type CastBallotAnswer = (typeof CAST_BALLOT_ANSWERS)[number];

/**
 * `api.close_round_stage` answers (M6.5). `ok`: this call closed the round. `closed`: it was already
 * closed (several phones calling at once). `not_yet`: before the deadline plus the 2 seconds of grace,
 * with `closes_at` the time to call again.
 */
export const CLOSE_ROUND_STAGE_ANSWERS = ['ok', 'closed', 'not_yet'] as const;
export type CloseRoundStageAnswer = (typeof CLOSE_ROUND_STAGE_ANSWERS)[number];

/** `api.round_progress` answers (M6.5): a restarted phone re-reads who has locked in. */
export const ROUND_PROGRESS_ANSWERS = ['ok'] as const;
export type RoundProgressAnswer = (typeof ROUND_PROGRESS_ANSWERS)[number];

/** The answers on a card the database accepts today (the `vote_answer` enum). */
export const VOTE_ANSWERS = ['nope', 'like', 'super_like', 'seen', 'seen_rewatch'] as const;
export type VoteAnswer = (typeof VOTE_ANSWERS)[number];

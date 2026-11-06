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

/**
 * `api.play_again` answers (M6.22): the host of a finished room opens the next one.
 * `unknown_mode` is a solo room. A caller who is not the host raises 42501.
 */
export const PLAY_AGAIN_ANSWERS = ['ok', 'not_finished', 'unknown_mode', 'name_required'] as const;
export type PlayAgainAnswer = (typeof PLAY_AGAIN_ANSWERS)[number];

/**
 * `api.room_runners_up` answers. `not_finished` is every state but done and abandoned and carries
 * nothing. A caller who is not a member (a removed seat included) raises 42501 (M6.48).
 */
export const ROOM_RUNNERS_UP_ANSWERS = ['ok', 'not_finished'] as const;
export type RoomRunnersUpAnswer = (typeof ROOM_RUNNERS_UP_ANSWERS)[number];

/** `api.update_room_settings` answers. */
export const UPDATE_ROOM_SETTINGS_ANSWERS = ['ok', 'closed', 'invalid_settings'] as const;
export type UpdateRoomSettingsAnswer = (typeof UPDATE_ROOM_SETTINGS_ANSWERS)[number];

/**
 * `api.set_seat_prefs` answers. `too_many` is more than 3 genres (M6.53); `unknown_genre` is an id
 * that is not a movie genre; `locked` means the room started and the picks are fixed.
 */
export const SET_SEAT_PREFS_ANSWERS = [
  'ok',
  'closed',
  'too_many',
  'unknown_genre',
  'locked',
] as const;
export type SetSeatPrefsAnswer = (typeof SET_SEAT_PREFS_ANSWERS)[number];

/**
 * `api.room_genres` answers (M6.53): tonight's offered genres with how many present seats picked
 * each, and the caller's own picks. A caller who is not a member raises 42501.
 */
export const ROOM_GENRES_ANSWERS = ['ok'] as const;
export type RoomGenresAnswer = (typeof ROOM_GENRES_ANSWERS)[number];

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
export const REQUEST_CARDS_ANSWERS = [
  'ok',
  'queued',
  'enough',
  'closed',
  'done',
  // M6.42: a solo seat used its cards for the day. Declared here so M6.42 edits no contract file.
  'daily_limit',
] as const;
export type RequestCardsAnswer = (typeof REQUEST_CARDS_ANSWERS)[number];

/**
 * `api.start_solo` answers (M6.40). `ok` is a room already swiping; `dealing` waits for the deck
 * worker (`deck_engine` `server`) and the phone follows `state_changed`. `too_few_films` carries
 * `eligible`; the room it made is abandoned. `daily_limit` comes with M6.42's cap.
 */
export const START_SOLO_ANSWERS = [
  'ok',
  'dealing',
  'name_required',
  'country_required',
  'invalid_settings',
  'too_few_films',
  'rate_limited',
  'daily_limit',
] as const;
export type StartSoloAnswer = (typeof START_SOLO_ANSWERS)[number];

/** `api.solo_pick` answers (M6.40). `not_liked`: the seat has no like on that film in this room. */
export const SOLO_PICK_ANSWERS = ['ok', 'not_liked', 'closed'] as const;
export type SoloPickAnswer = (typeof SOLO_PICK_ANSWERS)[number];

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

/**
 * My films (M6.41, solo-and-my-films.md). `api.my_films` has one answer, `ok`; a bad segment, filter or
 * cursor raises (22023). `api.my_film_card` answers `ok` with the card and the caller's own `seen`
 * and `liked` flags, `not_found` for a film outside the caller's own rows, `rate_limited` at 60 calls
 * per 10 minutes. `api.set_film_seen` and `api.remove_my_film` answer `ok`, `not_found` (nothing to
 * change) or `rate_limited` (they share 60 per 10 minutes).
 */
export const MY_FILMS_ANSWERS = ['ok'] as const;
export type MyFilmsAnswer = (typeof MY_FILMS_ANSWERS)[number];
export const MY_FILM_CARD_ANSWERS = ['ok', 'not_found', 'rate_limited'] as const;
export type MyFilmCardAnswer = (typeof MY_FILM_CARD_ANSWERS)[number];
export const SET_FILM_SEEN_ANSWERS = ['ok', 'not_found', 'rate_limited'] as const;
export type SetFilmSeenAnswer = (typeof SET_FILM_SEEN_ANSWERS)[number];
export const REMOVE_MY_FILM_ANSWERS = ['ok', 'not_found', 'rate_limited'] as const;
export type RemoveMyFilmAnswer = (typeof REMOVE_MY_FILM_ANSWERS)[number];

/** The segments and filters of `api.my_films`. The filter is ignored for `seen`. */
export const MY_FILMS_SEGMENTS = ['liked', 'seen'] as const;
export type MyFilmsSegment = (typeof MY_FILMS_SEGMENTS)[number];
export const MY_FILMS_FILTERS = ['all', 'friends', 'solo'] as const;
export type MyFilmsFilter = (typeof MY_FILMS_FILTERS)[number];

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

/**
 * `POST /v1/account/delete` on the HTTP API (not an `api` function): the HTTP code goes with
 * each answer (`ok` 200, `unauthorized` 401, `try_again` 503). A retry after `try_again`, or
 * after a dropped connection, finishes the job and answers `ok`.
 */
export const DELETE_ACCOUNT_ANSWERS = ['ok', 'unauthorized', 'try_again'] as const;
export type DeleteAccountAnswer = (typeof DELETE_ACCOUNT_ANSWERS)[number];

// Statuses are answers, not errors (app-structure.md#talking-to-the-backend). Each one
// has a message or a behaviour in the app; a test walks every answer so none is missed.
// These lists follow the docs; when a function changes, its list changes in the same PR.

/** `api.join_room` answers. `closed` is a stale invite link (roadmap M4.1). */
export const JOIN_ROOM_ANSWERS = [
  'ok',
  'not_found',
  'full',
  'starting',
  'in_finale',
  'name_required',
  'rate_limited',
  'closed',
] as const;
export type JoinRoomAnswer = (typeof JOIN_ROOM_ANSWERS)[number];

/** `api.cast_vote` answers. */
export const CAST_VOTE_ANSWERS = [
  'ok',
  'duplicate',
  'closed',
  'dropped',
  'no_super_likes',
] as const;
export type CastVoteAnswer = (typeof CAST_VOTE_ANSWERS)[number];

/** `api.cast_ballot` answers (game-modes.md#apicast_ballotround-ranking-veto). */
export const CAST_BALLOT_ANSWERS = [
  'ok',
  'not_in_room',
  'closed',
  'already_voted',
  'invalid',
  'no_veto',
] as const;
export type CastBallotAnswer = (typeof CAST_BALLOT_ANSWERS)[number];

/** The four answers on a card, plus the rewatch answer in rooms that allow rewatches. */
export const VOTE_ANSWERS = ['nope', 'like', 'super_like', 'seen', 'seen_rewatch'] as const;
export type VoteAnswer = (typeof VOTE_ANSWERS)[number];

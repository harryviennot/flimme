// Realtime topics and events (app-structure.md#realtime, game-modes.md). Realtime only
// tells; the database decides: on any event the phone re-reads what changed.

export const roomTopic = (roomId: string) => `room:${roomId}` as const;
export const roomLiveTopic = (roomId: string) => `room:${roomId}:live` as const;

/** Server events on `room:<id>`. The phone drops any event not listed here. */
export const ROOM_EVENTS = [
  'member_joined',
  'member_left',
  'member_removed',
  'room_locked',
  'seat_updated',
  'genres_changed',
  'settings_changed',
  'state_changed',
  'host_changed',
  'deck_updated',
  'near_miss',
  'match',
  'finale_started',
  'round_progress',
  'next_room',
] as const;
export type RoomEvent = (typeof ROOM_EVENTS)[number];

/**
 * What a phone tracks on `room:<id>:live`, keyed by its seat id (Q21.2). Nothing else goes in
 * presence: a vote, a name or a film would break "nobody sees who noped".
 */
export type LivePresence = { swipe_count: number; done: boolean };

/** Room states, in the order a game moves through them. */
export const ROOM_STATES = ['lobby', 'dealing', 'swiping', 'finale', 'done', 'abandoned'] as const;
export type RoomState = (typeof ROOM_STATES)[number];

/**
 * Payloads of the events the SQL sends today, as `internal.broadcast_room` builds them.
 * Events not listed here carry no payload the phone reads yet. `match` has no `result`.
 */
export type RoomEventPayloads = {
  member_joined: { member_id: string; display_name: string; avatar_key: string };
  member_left: { member_id: string; new_host_member_id: string | null };
  /** Only the seat id: who removed whom is the host's business, and no reason travels. */
  member_removed: { member_id: string };
  /** The saved value; only sent when it changed (api.set_room_locked, M4.23). */
  room_locked: { locked: boolean };
  seat_updated: { member_id: string };
  /** A seat's genre picks changed (M6.53). Empty: re-read `api.room_genres`; never who picked. */
  genres_changed: Record<string, never>;
  /**
   * The host opened the next room (api.play_again, M6.22). `host_member_id` is the host's seat in
   * this room, so phones name them from their seat list; the payload carries no name.
   */
  next_room: { room_id: string; code: string; host_member_id: string };
  /** The seat that now holds the host role; the sweeper sends it for a silent host (M6.6). */
  host_changed: { member_id: string };
  /** The six settings as saved, read back from the room (api.update_room_settings, M1.10). */
  settings_changed: {
    service_rule: 'any_member' | 'every_member';
    runtime_max: number | null;
    seen_rule: 'hide_seen' | 'allow_rewatch' | 'show_all';
    quality: 'standard' | 'hidden_gems' | 'guilty_pleasures';
    max_age: number | null;
    reveal: 'party' | 'blind';
  };
  // `reason` and `eligible` come with a start that went back to the lobby (M5.5).
  // `outcome: 'no_pick'` comes with a finale that found no liked film: the night ends with no pick (M6.4).
  state_changed: {
    state: RoomState;
    reason?: 'too_few_films';
    eligible?: number;
    outcome?: 'no_pick';
  };
  deck_updated: { member_ids: string[] };
  near_miss: { title_id: number; likes: number; of: number; needed: number };
  /**
   * The finale's result has `kind: 'finale'`. With a single qualifying film it carries
   * `reason: 'only_film'` and no finalists (M6.4). A lone match in Quick Match or Date Night is
   * decided with `reason: 'only_match'` and no finalists (M6.35); its `kind` is the match's own
   * (`unanimous` or `majority`), not `finale`, and `likes` and `of` are the match's counts.
   */
  match: {
    title_id: number;
    kind: MatchKind;
    likes: number;
    of: number;
    decided: boolean;
    /** Matches on the shortlist, this one included; absent on a finale's result (M6.34). */
    shortlisted?: number;
    /** The mode's matches_to_end: the shortlist's size; absent on a finale's result (M6.34). */
    shortlist_size?: number;
    /** `only_film` (M6.4) or `only_match` (M6.35), both with no finalists, or how a Final Cut was decided (M6.5). */
    reason?: 'only_film' | 'only_match' | 'only_unvetoed' | 'points' | 'no_ballots';
    finalists?: FinalistResult[];
  };
  /** Who has locked in, never what they voted (M6.5). */
  round_progress: { round_id: string; locked: string[]; of: number };
  finale_started: { round_id: string; title_ids: number[]; kind: FinaleKind; closes_at: string };
};

/** A finalist as the finale's `match` event reports it; `vetoed` means knocked out, never by whom. */
export type FinalistResult = { title_id: number; seed: number; points: number; vetoed: boolean };

export type MatchKind = 'unanimous' | 'majority' | 'finale';
export type FinaleKind = 'final_cut' | 'ranked_vote';

// Realtime topics and events (app-structure.md#realtime, game-modes.md). Realtime only
// tells; the database decides: on any event the phone re-reads what changed.

export const roomTopic = (roomId: string) => `room:${roomId}` as const;
export const roomLiveTopic = (roomId: string) => `room:${roomId}:live` as const;

/** Server events on `room:<id>`. The phone drops any event not listed here. */
export const ROOM_EVENTS = [
  'member_joined',
  'member_left',
  'seat_updated',
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

/** Room states, in the order a game moves through them. */
export const ROOM_STATES = ['lobby', 'dealing', 'swiping', 'finale', 'done', 'abandoned'] as const;
export type RoomState = (typeof ROOM_STATES)[number];

/**
 * Payloads of the events the SQL sends today, as `internal.broadcast_room` builds them.
 * Events not listed here carry no payload the phone reads yet (`host_changed`,
 * `round_progress`, `next_room` are planned: roadmap M6 and M7). `match` has no `result`.
 */
export type RoomEventPayloads = {
  member_joined: { member_id: string; display_name: string; avatar_key: string };
  member_left: { member_id: string; new_host_member_id: string | null };
  seat_updated: { member_id: string };
  /** The settings object the host saved (api.update_room_settings, M1.10 fixes its six values). */
  settings_changed: Record<string, unknown>;
  state_changed: { state: RoomState };
  deck_updated: { member_ids: string[] };
  near_miss: { title_id: number; likes: number; of: number };
  match: { title_id: number; kind: MatchKind; likes: number; of: number; decided: boolean };
  finale_started: { round_id: string; title_ids: number[]; kind: FinaleKind; closes_at: string };
};

export type MatchKind = 'unanimous' | 'majority' | 'finale';
export type FinaleKind = 'final_cut' | 'ranked_vote';

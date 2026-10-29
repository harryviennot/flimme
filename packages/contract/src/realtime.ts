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

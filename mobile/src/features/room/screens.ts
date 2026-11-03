import type { RoomState } from '@flimme/contract';

/** The screens that show a room state. Each state has exactly one. */
export type RoomScreen = 'lobby' | 'swipe' | 'final-cut' | 'winner' | 'closed';

/** The sheets that may sit over a state's screen. */
export type RoomSheet = 'invite' | 'services' | 'recap';

/**
 * The screen a room state calls for (app-structure.md#screens-and-navigation). `dealing` shows
 * the lobby: the "Shuffling" overlay belongs to it.
 */
export function roomScreenFor(state: RoomState): RoomScreen {
  switch (state) {
    case 'lobby':
    case 'dealing':
      return 'lobby';
    case 'swiping':
      return 'swipe';
    case 'finale':
      return 'final-cut';
    case 'done':
      return 'winner';
    case 'abandoned':
      return 'closed';
  }
}

const SHEETS: Record<RoomState, readonly RoomSheet[]> = {
  lobby: ['invite', 'services'],
  dealing: ['invite', 'services'],
  swiping: [],
  finale: [],
  done: ['recap'],
  abandoned: [],
};

/** Whether the phone may stay on this room screen (or sheet) while the room is in this state. */
export function isAllowed(state: RoomState, screen: string): boolean {
  return screen === roomScreenFor(state) || (SHEETS[state] as readonly string[]).includes(screen);
}

/** Whether a route name of the room layout is a sheet over another screen. */
export function isSheet(screen: string): screen is RoomSheet {
  return screen === 'invite' || screen === 'services' || screen === 'recap';
}

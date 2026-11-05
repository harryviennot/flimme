import type { RoomState } from '@flimme/contract';

/** The screens that show a room state. Each state has exactly one. */
export type RoomScreen = 'lobby' | 'swipe' | 'final-cut' | 'winner' | 'closed';

/** The sheets that may sit over a state's screen. */
export type RoomSheet = 'invite' | 'services' | 'seat' | 'report' | 'recap' | 'pick';

/**
 * The screen a room state calls for (app-structure.md#screens-and-navigation). `dealing` shows
 * the lobby: the "Shuffling" overlay belongs to it. A solo room has no lobby: while it deals, the
 * swipe screen shows its loading card (solo-setup.md#states-and-answers).
 */
export function roomScreenFor(state: RoomState, mode?: string): RoomScreen {
  switch (state) {
    case 'lobby':
      return 'lobby';
    case 'dealing':
      return mode === 'solo' ? 'swipe' : 'lobby';
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
  lobby: ['invite', 'services', 'seat', 'report'],
  dealing: ['invite', 'services', 'seat', 'report'],
  swiping: ['seat', 'report'],
  finale: [],
  done: ['recap'],
  abandoned: [],
};

/** Whether the phone may stay on this room screen (or sheet) while the room is in this state. */
export function isAllowed(state: RoomState, screen: string, mode?: string): boolean {
  // The pick sheet belongs to a solo room only.
  if (screen === 'pick') return state === 'swiping' && mode === 'solo';
  return (
    screen === roomScreenFor(state, mode) || (SHEETS[state] as readonly string[]).includes(screen)
  );
}

/** Whether a route name of the room layout is a sheet over another screen. */
export function isSheet(screen: string): screen is RoomSheet {
  return (
    screen === 'invite' ||
    screen === 'services' ||
    screen === 'seat' ||
    screen === 'report' ||
    screen === 'recap' ||
    screen === 'pick'
  );
}

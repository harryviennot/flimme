import type { RoomState } from '@flimme/contract';

import { isAllowed, roomScreenFor } from './screens';

describe('roomScreenFor', () => {
  it.each([
    ['lobby', 'lobby'],
    ['dealing', 'lobby'],
    ['swiping', 'swipe'],
    ['finale', 'final-cut'],
    ['done', 'winner'],
    ['abandoned', 'closed'],
  ] as [RoomState, string][])('%s shows %s', (state, screen) => {
    expect(roomScreenFor(state)).toBe(screen);
  });
});

describe('isAllowed', () => {
  it('lets the invite and services sheets sit over the lobby and the dealing', () => {
    for (const state of ['lobby', 'dealing'] as const) {
      expect(isAllowed(state, 'lobby')).toBe(true);
      expect(isAllowed(state, 'invite')).toBe(true);
      expect(isAllowed(state, 'services')).toBe(true);
    }
  });
  it('lets the recap sheet over the winner only', () => {
    expect(isAllowed('done', 'recap')).toBe(true);
    expect(isAllowed('done', 'winner')).toBe(true);
    expect(isAllowed('finale', 'recap')).toBe(false);
  });
  it('refuses any other screen', () => {
    expect(isAllowed('swiping', 'lobby')).toBe(false);
    expect(isAllowed('swiping', 'invite')).toBe(false);
    expect(isAllowed('abandoned', 'winner')).toBe(false);
  });
});

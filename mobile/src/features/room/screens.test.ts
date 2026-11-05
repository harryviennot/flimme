import type { RoomState } from '@flimme/contract';

import { isAllowed, isSheet, roomScreenFor } from './screens';

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
  it('lets the seat and report sheets over the lobby, the dealing and the swiping, not the finale', () => {
    for (const sheet of ['seat', 'report']) {
      expect(isAllowed('lobby', sheet)).toBe(true);
      expect(isAllowed('dealing', sheet)).toBe(true);
      expect(isAllowed('swiping', sheet)).toBe(true);
      expect(isAllowed('finale', sheet)).toBe(false);
      expect(isAllowed('done', sheet)).toBe(false);
      expect(isSheet(sheet)).toBe(true);
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

describe('a solo room', () => {
  it('swipes while it deals, and has no lobby', () => {
    expect(roomScreenFor('dealing', 'solo')).toBe('swipe');
    expect(roomScreenFor('dealing', 'quick_match')).toBe('lobby');
    expect(isAllowed('dealing', 'swipe', 'solo')).toBe(true);
  });
  it('lets the pick sheet over the swiping only', () => {
    expect(isAllowed('swiping', 'pick', 'solo')).toBe(true);
    expect(isAllowed('swiping', 'pick', 'quick_match')).toBe(false);
    expect(isAllowed('done', 'pick', 'solo')).toBe(false);
    expect(isSheet('pick')).toBe(true);
  });
});

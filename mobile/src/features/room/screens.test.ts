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

describe('the genres sheet', () => {
  it('sits over the lobby only: picks lock at Start', () => {
    expect(isAllowed('lobby', 'genres')).toBe(true);
    expect(isSheet('genres')).toBe(true);
    for (const state of ['dealing', 'swiping', 'finale', 'done', 'abandoned'] as const) {
      expect(isAllowed(state, 'genres')).toBe(false);
    }
  });
});

describe('the people search sheet', () => {
  it('sits over the lobby only: skips lock at Start', () => {
    expect(isAllowed('lobby', 'skip-people')).toBe(true);
    expect(isSheet('skip-people')).toBe(true);
    for (const state of ['dealing', 'swiping', 'finale', 'done', 'abandoned'] as const) {
      expect(isAllowed(state, 'skip-people')).toBe(false);
    }
  });
});

describe('the genre step', () => {
  it('stays in the lobby only and is a screen, not a sheet', () => {
    expect(isAllowed('lobby', 'genre-step')).toBe(true);
    expect(isSheet('genre-step')).toBe(false);
    for (const state of ['dealing', 'swiping', 'finale', 'done', 'abandoned'] as const) {
      expect(isAllowed(state, 'genre-step')).toBe(false);
    }
  });
});

describe('the players sheet', () => {
  it('sits over the swiping only, and closes when the finale starts', () => {
    expect(isSheet('players')).toBe(true);
    expect(isAllowed('swiping', 'players')).toBe(true);
    for (const state of ['lobby', 'dealing', 'finale', 'done', 'abandoned'] as const) {
      expect(isAllowed(state, 'players')).toBe(false);
    }
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
  it('lets the runner-up film sheet over the winner only', () => {
    expect(isAllowed('done', 'film')).toBe(true);
    expect(isAllowed('finale', 'film')).toBe(false);
    expect(isAllowed('swiping', 'film')).toBe(false);
    expect(isSheet('film')).toBe(true);
  });
  it('lets the synopsis sheet over the swipe screen and the Final Cut only', () => {
    expect(isAllowed('swiping', 'synopsis')).toBe(true);
    expect(isAllowed('swiping', 'synopsis', 'solo')).toBe(true);
    expect(isAllowed('finale', 'synopsis')).toBe(true);
    expect(isAllowed('done', 'synopsis')).toBe(false);
    expect(isAllowed('lobby', 'synopsis')).toBe(false);
    expect(isSheet('synopsis')).toBe(true);
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

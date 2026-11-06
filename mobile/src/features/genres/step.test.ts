import {
  askGenres,
  genreAskAction,
  forgetGenreAsk,
  groupedCode,
  showsCounts,
  stepFooter,
  takeGenreAsk,
} from './step';

describe('the genre step request', () => {
  afterEach(() => forgetGenreAsk());

  it('is asked once per room and consumed by the first take', () => {
    askGenres('room-1');
    expect(takeGenreAsk('room-1')).toBe(true);
    expect(takeGenreAsk('room-1')).toBe(false);
  });

  it('is never given for a room nobody asked about (cold start, return, reconnect)', () => {
    askGenres('room-1');
    expect(takeGenreAsk('room-2')).toBe(false);
    expect(takeGenreAsk('room-1')).toBe(true);
  });

  it('forgets everything on demand', () => {
    askGenres('room-1');
    forgetGenreAsk();
    expect(takeGenreAsk('room-1')).toBe(false);
  });
});

describe('showsCounts', () => {
  it('hides counts while the phone is the only present seat', () => {
    expect(showsCounts(0)).toBe(false);
    expect(showsCounts(1)).toBe(false);
    expect(showsCounts(2)).toBe(true);
  });
});

describe('groupedCode', () => {
  it('groups the six digits as on the ticket', () => {
    expect(groupedCode('482913')).toBe('482 913');
    expect(groupedCode(undefined)).toBe('');
  });
});

describe('stepFooter', () => {
  const base = { picks: 0, ready: true, failed: false, saveFailed: false, online: true };

  it('says Any genre with no pick, Continue with picks', () => {
    expect(stepFooter(base)).toEqual({ primary: 'any', skip: false });
    expect(stepFooter({ ...base, picks: 2 })).toEqual({ primary: 'continue', skip: false });
  });

  it('keeps Any genre while loading', () => {
    expect(stepFooter({ ...base, ready: false, picks: 2 })).toEqual({
      primary: 'any',
      skip: false,
    });
  });

  it('shows Skip for now after a failed save, or offline with picks', () => {
    expect(stepFooter({ ...base, picks: 1, saveFailed: true }).skip).toBe(true);
    expect(stepFooter({ ...base, picks: 1, online: false }).skip).toBe(true);
  });

  it('hides Skip when the read failed: the primary already skips', () => {
    expect(stepFooter({ ...base, ready: false, failed: true, saveFailed: true })).toEqual({
      primary: 'any',
      skip: false,
    });
  });
});

describe('genreAskAction', () => {
  it('asks in the lobby once the phone is on it, drops past the lobby, waits otherwise', () => {
    expect(genreAskAction('lobby', 'lobby')).toBe('ask');
    expect(genreAskAction('lobby', 'genre-step')).toBe('wait');
    expect(genreAskAction('lobby', undefined)).toBe('wait');
    expect(genreAskAction(undefined, 'lobby')).toBe('wait');
    for (const state of ['dealing', 'swiping', 'finale', 'done', 'abandoned']) {
      expect(genreAskAction(state, 'lobby')).toBe('drop');
    }
  });
});

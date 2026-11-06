import { clearLive, LIVE_WINDOW_MS, noteLive, takeLive } from './live-moments';
import { arrivalSeats, startSoundDue } from './sounds';

const ids = (...x: string[]) => new Set(x);

describe('startSoundDue', () => {
  it('plays when the lobby goes to dealing live', () => {
    expect(startSoundDue('lobby', 'dealing', true)).toBe(true);
  });

  it('plays nothing for a re-read, a cold start or a room first seen as swiping', () => {
    expect(startSoundDue('lobby', 'dealing', false)).toBe(false);
    expect(startSoundDue(undefined, 'dealing', true)).toBe(false);
    expect(startSoundDue('lobby', 'swiping', true)).toBe(false);
    expect(startSoundDue(undefined, 'swiping', true)).toBe(false);
  });

  it('plays again when the deal went back to the lobby and the host starts again', () => {
    expect(startSoundDue('dealing', 'lobby', true)).toBe(false);
    expect(startSoundDue('lobby', 'dealing', true)).toBe(true);
  });
});

describe('arrivalSeats', () => {
  const base = { mine: 'me', state: 'lobby' as const, live: true };

  it('gives the seat count after a live arrival, on a phone already in the lobby', () => {
    expect(arrivalSeats({ ...base, before: ids('me', 'a'), after: ids('me', 'a', 'b') })).toBe(3);
  });

  it('gives one count, the final one, for two arrivals in one read', () => {
    expect(arrivalSeats({ ...base, before: ids('me', 'a'), after: ids('me', 'a', 'b', 'c') })).toBe(
      4,
    );
  });

  it('plays nothing for the joiner own arrival or a first read', () => {
    expect(arrivalSeats({ ...base, before: ids('a'), after: ids('a', 'me') })).toBeNull();
    expect(arrivalSeats({ ...base, before: null, after: ids('me', 'a') })).toBeNull();
  });

  it('plays nothing for a departure, a re-read, or outside the lobby', () => {
    expect(
      arrivalSeats({ ...base, before: ids('me', 'a', 'b'), after: ids('me', 'a') }),
    ).toBeNull();
    expect(
      arrivalSeats({ ...base, live: false, before: ids('me'), after: ids('me', 'a') }),
    ).toBeNull();
    expect(
      arrivalSeats({ ...base, state: 'swiping', before: ids('me'), after: ids('me', 'a') }),
    ).toBeNull();
  });

  it('plays the note for the new count after a departure and an arrival', () => {
    expect(arrivalSeats({ ...base, before: ids('me', 'a'), after: ids('me', 'a', 'b') })).toBe(3);
  });
});

describe('live moments', () => {
  afterEach(() => clearLive('r'));

  it('hands a note out once', () => {
    noteLive('r', 'joined', 1000);
    expect(takeLive('r', 'joined', 1500)).toBe(true);
    expect(takeLive('r', 'joined', 1600)).toBe(false);
  });

  it('forgets a note whose re-read never came', () => {
    noteLive('r', 'state', 0);
    expect(takeLive('r', 'state', LIVE_WINDOW_MS + 1)).toBe(false);
  });

  it('has no note without an event, as after a reconnect', () => {
    expect(takeLive('r', 'state')).toBe(false);
  });
});

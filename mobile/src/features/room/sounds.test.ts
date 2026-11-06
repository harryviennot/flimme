import {
  claimStartSound,
  clearLive,
  LIVE_WINDOW_MS,
  noteLive,
  resetStartClaims,
  START_CLAIM_MS,
  takeLive,
} from './live-moments';
import { arrivalSeats, startSoundDue } from './sounds';

const ids = (...x: string[]) => new Set(x);

describe('startSoundDue', () => {
  it('plays when a state_changed says dealing to a phone in the lobby', () => {
    expect(startSoundDue('lobby', { state: 'dealing' })).toBe(true);
  });

  it('plays nothing for a phone not in the lobby, or another state, or no payload', () => {
    expect(startSoundDue(undefined, { state: 'dealing' })).toBe(false);
    expect(startSoundDue('swiping', { state: 'dealing' })).toBe(false);
    expect(startSoundDue('lobby', { state: 'swiping' })).toBe(false);
    expect(startSoundDue('lobby', null)).toBe(false);
  });

  it('claims the start once, so the host answer and the event play one sound', () => {
    resetStartClaims();
    expect(claimStartSound('r', 0)).toBe(true);
    expect(claimStartSound('r', 1000)).toBe(false);
    // The deal went back to the lobby and the host starts again later.
    expect(claimStartSound('r', START_CLAIM_MS + 1)).toBe(true);
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
    noteLive('r', 'joined', 0);
    expect(takeLive('r', 'joined', LIVE_WINDOW_MS + 1)).toBe(false);
  });

  it('has no note without an event, as after a reconnect', () => {
    expect(takeLive('r', 'joined')).toBe(false);
  });
});

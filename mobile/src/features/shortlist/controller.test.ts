import {
  BEAT_FLIGHT_MS,
  BEAT_SHOW_MS,
  BEAT_TAIL_MS,
  createShortlistController,
  HOLD_LIMIT_MS,
} from './controller';

// The shortlisted beat's rules without JSX (moments.md#the-shortlisted-beat).

function setup() {
  const onBeat = jest.fn();
  const onMismatch = jest.fn();
  const controller = createShortlistController({ onBeat, onMismatch });
  return { controller, onBeat, onMismatch, snap: () => controller.getSnapshot() };
}

const event = (title_id: number, shortlisted: number, extra = {}) => ({
  title_id,
  likes: 3,
  of: 3,
  decided: false,
  shortlisted,
  shortlist_size: 3,
  ...extra,
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('one beat', () => {
  it('plays once from an event, with the count, and the film lands after the flight', () => {
    const { controller, onBeat, snap } = setup();
    controller.signal(event(10, 1));
    expect(onBeat).toHaveBeenCalledTimes(1);
    expect(snap().beat).toMatchObject({ title_id: 10, count: 1, likes: 3, of: 3 });
    expect(snap().phase).toBe('show');
    expect(snap().active).toBe(true);
    expect(snap().landed).toEqual([]);

    jest.advanceTimersByTime(BEAT_SHOW_MS);
    expect(snap().phase).toBe('fly');
    jest.advanceTimersByTime(BEAT_FLIGHT_MS);
    expect(snap().landed).toEqual([10]);
    expect(snap().phase).toBe('tail');
    expect(snap().active).toBe(true);
    jest.advanceTimersByTime(BEAT_TAIL_MS);
    expect(snap().active).toBe(false);
    expect(snap().beat).toBeNull();
  });

  it('the whole beat is about 1.75 seconds', () => {
    expect(BEAT_SHOW_MS + BEAT_FLIGHT_MS + BEAT_TAIL_MS).toBe(1750);
  });

  it('starts from the phone own answer with its count plus one, no vote count', () => {
    const { controller, snap } = setup();
    controller.readBack([1]);
    controller.signal({ title_id: 10, decided: false });
    expect(snap().beat).toMatchObject({ title_id: 10, count: 2, likes: null, of: null });
  });

  it('the event after the answer corrects the count in place and plays no second beat', () => {
    const { controller, onBeat, snap } = setup();
    controller.signal({ title_id: 10, decided: false });
    controller.signal(event(10, 2));
    expect(onBeat).toHaveBeenCalledTimes(1);
    expect(snap().beat).toMatchObject({ count: 2, likes: 3, of: 3 });
    jest.advanceTimersByTime(BEAT_SHOW_MS + BEAT_FLIGHT_MS + BEAT_TAIL_MS);
    expect(snap().landed).toEqual([10]);
  });

  it('the same match from both signals, or a repeated event, is one beat', () => {
    const { controller, onBeat } = setup();
    controller.signal(event(10, 1));
    controller.signal(event(10, 1));
    controller.signal({ title_id: 10, decided: false });
    jest.advanceTimersByTime(BEAT_SHOW_MS + BEAT_FLIGHT_MS + BEAT_TAIL_MS);
    controller.signal(event(10, 1));
    expect(onBeat).toHaveBeenCalledTimes(1);
  });

  it('ignores a decided match: the overlay is that one', () => {
    const { controller, onBeat, snap } = setup();
    controller.signal({ ...event(10, 1), decided: true });
    controller.signal({ title_id: 10 });
    expect(onBeat).not.toHaveBeenCalled();
    expect(snap().active).toBe(false);
  });

  it('knows the size from the event', () => {
    const { controller, snap } = setup();
    expect(snap().size).toBe(3);
    controller.signal(event(10, 1, { shortlist_size: 4 }));
    expect(snap().size).toBe(4);
  });
});

describe('several beats', () => {
  it('plays two matches back to back, the count stepping up, the scrim staying', () => {
    const { controller, onBeat, snap } = setup();
    controller.signal(event(10, 1));
    controller.signal(event(11, 2));
    jest.advanceTimersByTime(BEAT_SHOW_MS + BEAT_FLIGHT_MS);
    expect(snap().landed).toEqual([10]);
    expect(snap().beat).toMatchObject({ title_id: 11, count: 2 });
    expect(snap().phase).toBe('show');
    expect(snap().active).toBe(true);
    expect(onBeat).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(BEAT_SHOW_MS + BEAT_FLIGHT_MS + BEAT_TAIL_MS);
    expect(snap().landed).toEqual([10, 11]);
    expect(snap().active).toBe(false);
  });
});

describe('the hold', () => {
  it('holds the route while a beat plays and lets go after it', () => {
    const { controller, snap } = setup();
    expect(snap().holding).toBe(false);
    controller.signal(event(10, 3));
    expect(snap().holding).toBe(true);
    jest.advanceTimersByTime(BEAT_SHOW_MS + BEAT_FLIGHT_MS + BEAT_TAIL_MS);
    expect(snap().holding).toBe(false);
  });

  it('never holds longer than 3 seconds', () => {
    const { controller, snap } = setup();
    controller.signal(event(10, 1));
    controller.signal(event(11, 2));
    controller.signal(event(12, 3));
    jest.advanceTimersByTime(HOLD_LIMIT_MS);
    expect(snap().active).toBe(true);
    expect(snap().holding).toBe(false);
  });
});

describe('read-back', () => {
  it('fills the slots with no beat, in order, and never replays', () => {
    const { controller, onBeat, snap } = setup();
    controller.readBack([5, 6]);
    expect(snap().landed).toEqual([5, 6]);
    expect(snap().active).toBe(false);
    expect(onBeat).not.toHaveBeenCalled();
    controller.signal(event(6, 2));
    expect(onBeat).not.toHaveBeenCalled();
  });

  it('does not take away a film that is still in a beat', () => {
    const { controller, snap } = setup();
    controller.signal(event(10, 1));
    controller.readBack([10]);
    expect(snap().landed).toEqual([]);
    jest.advanceTimersByTime(BEAT_SHOW_MS + BEAT_FLIGHT_MS);
    expect(snap().landed).toEqual([10]);
  });

  it('asks for a read when the event counts more films than the phone knows', () => {
    const { controller, onMismatch } = setup();
    controller.signal(event(11, 2));
    expect(onMismatch).toHaveBeenCalledTimes(1);
  });

  it('knows every film of the shortlist, landed or not', () => {
    const { controller, snap } = setup();
    controller.readBack([5]);
    controller.signal(event(10, 2));
    expect([...snap().known].sort()).toEqual([10, 5]);
  });
});

describe('the pick arrives', () => {
  it('ends the beat at once and lands the films', () => {
    const { controller, snap } = setup();
    controller.signal(event(10, 1));
    controller.signal(event(11, 2));
    controller.pickArrived();
    expect(snap().active).toBe(false);
    expect(snap().holding).toBe(false);
    expect(snap().landed).toEqual([10, 11]);
    jest.advanceTimersByTime(5000);
    expect(snap().landed).toEqual([10, 11]);
  });
});

describe('stop', () => {
  it('takes no more signals', () => {
    const { controller, onBeat } = setup();
    controller.stop();
    controller.signal(event(10, 1));
    expect(onBeat).not.toHaveBeenCalled();
  });
});

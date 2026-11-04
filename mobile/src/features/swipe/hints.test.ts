import type { KeyValueStore } from '@/lib/storage';

import {
  createHintSignals,
  createHintsStore,
  hintsToFinish,
  visibleHint,
  type HintDone,
  type HintSignals,
} from './hints';

function memoryKv(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
    getItemSync: (k) => map.get(k) ?? null,
    setItemSync: (k, v) => void map.set(k, v),
    removeItemSync: (k) => void map.delete(k),
  };
}

const none: HintDone = { swipe: false, seen: false, flip: false, superLikes: false };
const fresh: HintSignals = {
  answers: 0,
  seenAnswered: false,
  starTapped: false,
  superFrom: null,
  superDismissed: false,
  flips: 0,
};
const at = (patch: Partial<HintSignals>): HintSignals => ({ ...fresh, ...patch });

describe('which hint shows', () => {
  it('shows the swipe hint on card 1 of a fresh phone', () => {
    expect(visibleHint(none, fresh)).toBe('swipe');
  });

  it('shows the Seen it hint on card 2, and the flip hint replaces it on card 3', () => {
    expect(visibleHint(none, at({ answers: 1 }))).toBe('seen');
    expect(visibleHint(none, at({ answers: 2 }))).toBe('flip');
  });

  it('drops the Seen it hint at the first Seen it', () => {
    const signals = at({ answers: 1, seenAnswered: true });
    expect(visibleHint(none, signals)).toBeNull();
    expect(hintsToFinish(none, signals)).toContain('seen');
  });

  it('keeps the Seen it hint to card 10 when the flip hint was already seen', () => {
    const done = { ...none, flip: true };
    expect(visibleHint(done, at({ answers: 3 }))).toBe('seen');
    expect(visibleHint(done, at({ answers: 9, superFrom: 4 }))).toBeNull();
    expect(hintsToFinish(done, at({ answers: 9 }))).toContain('seen');
  });

  it('drops the flip hint at the first flip or card 10', () => {
    expect(visibleHint(none, at({ answers: 2, flips: 1, seenAnswered: true }))).toBeNull();
    expect(hintsToFinish(none, at({ answers: 2, flips: 1 }))).toContain('flip');
    expect(visibleHint({ ...none, seen: true }, at({ answers: 9, superFrom: 4 }))).toBeNull();
  });

  it('shows the super likes hint after the first star tap, or at card 5', () => {
    expect(visibleHint(none, at({ answers: 1, starTapped: true, superFrom: 1 }))).toBe(
      'superLikes',
    );
    expect(visibleHint(none, at({ answers: 4, superFrom: 4 }))).toBe('superLikes');
  });

  it('keeps the super likes hint until dismissed or 3 answers later', () => {
    const base = { starTapped: true, superFrom: 1 };
    expect(visibleHint(none, at({ ...base, answers: 3 }))).toBe('superLikes');
    expect(visibleHint(none, at({ ...base, answers: 4 }))).not.toBe('superLikes');
    expect(visibleHint(none, at({ ...base, answers: 2, superDismissed: true }))).not.toBe(
      'superLikes',
    );
    expect(hintsToFinish(none, at({ ...base, answers: 2, superDismissed: true }))).toContain(
      'superLikes',
    );
  });

  it('never shows a hint that is done', () => {
    const all = { swipe: true, seen: true, flip: true, superLikes: true };
    for (let answers = 0; answers < 12; answers++) {
      expect(visibleHint(all, at({ answers, starTapped: true, superFrom: 1 }))).toBeNull();
    }
  });

  it('finishes the swipe hint at the first answer', () => {
    expect(hintsToFinish(none, fresh)).toEqual([]);
    expect(hintsToFinish(none, at({ answers: 1 }))).toContain('swipe');
  });
});

describe('the game signals', () => {
  it('counts answers and notices the first Seen it and the first star tap', () => {
    const signals = createHintSignals();
    signals.getState().record('like');
    expect(signals.getState()).toMatchObject({
      answers: 1,
      seenAnswered: false,
      starTapped: false,
    });
    signals.getState().record('seen');
    signals.getState().record('super_like');
    expect(signals.getState()).toMatchObject({
      answers: 3,
      seenAnswered: true,
      starTapped: true,
      superFrom: 3,
    });
  });

  it('starts the super likes hint at card 5 without a star tap', () => {
    const signals = createHintSignals();
    for (let i = 0; i < 4; i++) signals.getState().record('nope');
    expect(signals.getState().superFrom).toBe(4);
  });

  it('remembers a dismissal', () => {
    const signals = createHintSignals();
    signals.getState().dismissSuperLikes();
    expect(signals.getState().superDismissed).toBe(true);
  });
});

describe('the hints that are gone', () => {
  it('stay gone after a restart, and one not finished shows again', () => {
    const kv = memoryKv();
    const first = createHintsStore(kv);
    first.getState().finish('swipe');
    first.getState().finish('seen');
    const second = createHintsStore(kv);
    expect(second.getState().done).toEqual({ ...none, swipe: true, seen: true });
    expect(visibleHint(second.getState().done, at({ answers: 2 }))).toBe('flip');
  });

  it('come back after a reset (the dev menu row)', () => {
    const store = createHintsStore(memoryKv());
    store.getState().finish('swipe');
    store.getState().reset();
    expect(store.getState().done).toEqual(none);
  });

  it('starts empty on a fresh phone and reads bad saved data as empty', () => {
    expect(createHintsStore(memoryKv()).getState().done).toEqual(none);
    const kv = memoryKv();
    kv.setItemSync(
      'flimme.hints',
      JSON.stringify({ state: { done: { swipe: 'yes' } }, version: 1 }),
    );
    expect(createHintsStore(kv).getState().done).toEqual(none);
  });
});

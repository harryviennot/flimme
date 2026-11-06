import { ApiError } from '@flimme/contract';

import type { KeyValueStore } from '@/lib/storage';

import { createPendingSaves } from './pending';
import { createSaveSettler, SAVE_RETRY_DELAYS_MS } from './settle';

function memoryKv(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
    getItemSync: (k) => data.get(k) ?? null,
    setItemSync: (k, v) => void data.set(k, v),
    removeItemSync: (k) => void data.delete(k),
  };
}

type Answer = 'ok' | 'not_found' | 'rate_limited';

function setup(answers: (Answer | Error)[] = []) {
  const store = createPendingSaves(memoryKv());
  const calls: { title_id: number; saved: boolean }[] = [];
  const setFilmSaved = jest.fn(async (args: { title_id: number; saved: boolean }) => {
    calls.push(args);
    const next = answers.shift() ?? 'ok';
    if (next instanceof Error) throw next;
    return { status: next };
  });
  const refreshSession = jest.fn(async () => {});
  const settler = createSaveSettler({ store, setFilmSaved, refreshSession });
  return { store, calls, setFilmSaved, refreshSession, settler };
}

const network = () => new ApiError('network', 'set_film_saved', 'offline');
const denied = () => new ApiError('denied', 'set_film_saved', 'denied');
const unexpected = () => new ApiError('unexpected', 'set_film_saved', 'boom');

describe('the save settler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('sends the waiting saves in order and empties the list', async () => {
    const t = setup();
    t.store.getState().put(1, true);
    t.store.getState().put(2, false);
    await t.settler.run();
    expect(t.calls).toEqual([
      { title_id: 1, saved: true },
      { title_id: 2, saved: false },
    ]);
    expect(t.store.getState().items).toEqual([]);
  });

  it('treats not_found as done (unsaving a film that is not saved)', async () => {
    const t = setup(['not_found']);
    t.store.getState().put(1, false);
    await t.settler.run();
    expect(t.store.getState().items).toEqual([]);
  });

  it('keeps a save the network lost and tries again after the first delay', async () => {
    const t = setup([network()]);
    t.store.getState().put(1, true);
    await t.settler.run();
    expect(t.store.getState().items).toEqual([{ title_id: 1, saved: true }]);
    await jest.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);
    expect(t.calls).toHaveLength(2);
    expect(t.store.getState().items).toEqual([]);
  });

  it('backs off on a rate limit and keeps the save', async () => {
    const t = setup(['rate_limited', 'rate_limited']);
    t.store.getState().put(1, true);
    await t.settler.run();
    expect(t.store.getState().items).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);
    expect(t.store.getState().items).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[1]!);
    expect(t.store.getState().items).toEqual([]);
  });

  it('refreshes the session once on a denial, then drops the save if still denied', async () => {
    const t = setup([denied(), denied()]);
    t.store.getState().put(1, true);
    await t.settler.run();
    expect(t.refreshSession).toHaveBeenCalledTimes(1);
    expect(t.store.getState().items).toEqual([]);
  });

  it('sends again after a refreshed session', async () => {
    const t = setup([denied(), 'ok']);
    t.store.getState().put(1, true);
    await t.settler.run();
    expect(t.calls).toHaveLength(2);
    expect(t.store.getState().items).toEqual([]);
  });

  it('drops a save the server refuses for good, so it cannot block the ones behind it', async () => {
    const t = setup([unexpected(), 'ok']);
    t.store.getState().put(1, true);
    t.store.getState().put(2, true);
    await t.settler.run();
    expect(t.calls.map((c) => c.title_id)).toEqual([1, 2]);
    expect(t.store.getState().items).toEqual([]);
  });

  it('keeps a changed mind that arrived while the first was on its way', async () => {
    const t = setup();
    t.setFilmSaved.mockImplementationOnce(async (args) => {
      t.calls.push(args);
      t.store.getState().put(1, false);
      return { status: 'ok' as const };
    });
    t.store.getState().put(1, true);
    await t.settler.run();
    expect(t.calls).toEqual([
      { title_id: 1, saved: true },
      { title_id: 1, saved: false },
    ]);
    expect(t.store.getState().items).toEqual([]);
  });

  it('a flush tries at once and starts the delays again', async () => {
    const t = setup([network()]);
    t.store.getState().put(1, true);
    await t.settler.run();
    await t.settler.flush();
    expect(t.calls).toHaveLength(2);
    expect(t.store.getState().items).toEqual([]);
  });

  it('stops retrying when cleared', async () => {
    const t = setup([network()]);
    t.store.getState().put(1, true);
    await t.settler.run();
    t.settler.clear();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(t.calls).toHaveLength(1);
  });
});

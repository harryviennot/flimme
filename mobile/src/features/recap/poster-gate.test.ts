import { createPosterGate, POSTER_WAIT_MS } from './poster-gate';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the poster gate (recap.md#sharing)', () => {
  it('opens at once when there is no poster to wait for', async () => {
    await expect(createPosterGate(false).wait()).resolves.toBeUndefined();
  });

  it('waits for the poster, then goes ahead', async () => {
    const gate = createPosterGate(true);
    let done = false;
    void gate.wait().then(() => (done = true));
    await jest.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    gate.markLoaded();
    await jest.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  it('goes ahead with the placeholder after 3 seconds', async () => {
    expect(POSTER_WAIT_MS).toBe(3000);
    const gate = createPosterGate(true);
    let done = false;
    void gate.wait().then(() => (done = true));
    await jest.advanceTimersByTimeAsync(POSTER_WAIT_MS - 1);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('stays open once the poster loaded', async () => {
    const gate = createPosterGate(true);
    gate.markLoaded();
    await expect(gate.wait()).resolves.toBeUndefined();
  });
});

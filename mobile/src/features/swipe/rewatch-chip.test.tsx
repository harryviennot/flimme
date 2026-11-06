import { act, renderHook } from '@testing-library/react-native';

import { REWATCH_CHIP_MS, REWATCH_DONE_MS, useRewatchChip } from './rewatch-chip';

// The chip's lifetime (swipe.md#seen-it-the-rewatch-question): it stays until the next answer
// or 5 seconds, never on a timer with a screen reader on; the confirmation shows for 1.5 s.

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const open = (screenReader = false) =>
  renderHook((props: { screenReader: boolean }) => useRewatchChip(props.screenReader), {
    initialProps: { screenReader },
  });

describe('the rewatch chip', () => {
  it('uses the decided times', () => {
    expect(REWATCH_CHIP_MS).toBe(5000);
    expect(REWATCH_DONE_MS).toBe(1500);
  });

  it('is not there until a Seen it offers it', async () => {
    const { result } = await open();
    expect(result.current.titleId).toBeNull();
    expect(result.current.done).toBe(false);
  });

  it('stays for 5 seconds, then leaves', async () => {
    const { result } = await open();
    await act(async () => result.current.offer(7));
    expect(result.current.titleId).toBe(7);
    await act(async () => void jest.advanceTimersByTime(REWATCH_CHIP_MS - 1));
    expect(result.current.titleId).toBe(7);
    await act(async () => void jest.advanceTimersByTime(1));
    expect(result.current.titleId).toBeNull();
  });

  it('starts its 5 seconds again for the next Seen it', async () => {
    const { result } = await open();
    await act(async () => result.current.offer(7));
    await act(async () => void jest.advanceTimersByTime(4000));
    await act(async () => result.current.offer(8));
    await act(async () => void jest.advanceTimersByTime(4000));
    expect(result.current.titleId).toBe(8);
    await act(async () => void jest.advanceTimersByTime(1000));
    expect(result.current.titleId).toBeNull();
  });

  it('never leaves on a timer while a screen reader is on', async () => {
    const { result } = await open(true);
    await act(async () => result.current.offer(7));
    await act(async () => void jest.advanceTimersByTime(REWATCH_CHIP_MS * 10));
    expect(result.current.titleId).toBe(7);
    await act(async () => result.current.clear());
    expect(result.current.titleId).toBeNull();
  });

  it('starts the timer when the screen reader goes off', async () => {
    const { result, rerender } = await open(true);
    await act(async () => result.current.offer(7));
    await rerender({ screenReader: false });
    await act(async () => void jest.advanceTimersByTime(REWATCH_CHIP_MS));
    expect(result.current.titleId).toBeNull();
  });

  it('leaves when cleared (the next answer, an Undo, the room moving on)', async () => {
    const { result } = await open();
    await act(async () => result.current.offer(7));
    await act(async () => result.current.clear());
    expect(result.current.titleId).toBeNull();
    expect(result.current.done).toBe(false);
  });

  it('claims the offered film once: a second Yes finds nothing', async () => {
    const { result } = await open();
    await act(async () => result.current.offer(7));
    let first: number | null = null;
    let second: number | null = null;
    await act(async () => {
      first = result.current.claim();
      second = result.current.claim();
    });
    expect(first).toBe(7);
    expect(second).toBeNull();
  });

  it('confirms for 1.5 seconds after Yes, then goes', async () => {
    const { result } = await open();
    await act(async () => result.current.offer(7));
    await act(async () => void result.current.claim());
    expect(result.current.titleId).toBeNull();
    expect(result.current.done).toBe(true);
    await act(async () => void jest.advanceTimersByTime(REWATCH_DONE_MS - 1));
    expect(result.current.done).toBe(true);
    await act(async () => void jest.advanceTimersByTime(1));
    expect(result.current.done).toBe(false);
  });

  it('confirms for 1.5 seconds even with a screen reader on', async () => {
    const { result } = await open(true);
    await act(async () => result.current.offer(7));
    await act(async () => void result.current.claim());
    await act(async () => void jest.advanceTimersByTime(REWATCH_DONE_MS));
    expect(result.current.done).toBe(false);
  });

  it('drops the confirmation when the next Seen it offers the chip again', async () => {
    const { result } = await open();
    await act(async () => result.current.offer(7));
    await act(async () => void result.current.claim());
    await act(async () => result.current.offer(8));
    expect(result.current.done).toBe(false);
    expect(result.current.titleId).toBe(8);
  });
});

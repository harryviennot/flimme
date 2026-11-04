import { act, renderHook } from '@testing-library/react-native';

import {
  clearNearMisses,
  nearMissFor,
  parseNearMiss,
  recordNearMiss,
  useNearMiss,
} from './near-miss';

// The near miss: which counts show, on which card, and when.

const ROOM = 'room-1';
const mockHandlers = new Map<string, (payload: unknown) => void>();
const mockRoom: { data: { reveal: string } | undefined } = { data: { reveal: 'party' } };
jest.mock('@/features/room', () => ({
  useRoom: () => mockRoom,
  useRoomEvent: (_room: string, event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
jest.mock('./index', () => ({ voteQueue: { has: () => false } }));

const miss = (title_id: number, likes = 2, of = 3, needed = 3) => ({
  title_id,
  likes,
  of,
  needed,
});
const send = (payload: unknown) => act(async () => void mockHandlers.get('near_miss')?.(payload));

beforeEach(() => {
  jest.useFakeTimers();
  clearNearMisses();
  mockRoom.data = { reveal: 'party' };
});
afterEach(() => jest.useRealTimers());

const settle = () => act(async () => void jest.advanceTimersByTime(300));

describe('the rules', () => {
  const party = { party: true, answered: false };

  it('shows the count one like short of the rule', async () => {
    expect(nearMissFor({ likes: 2, of: 3, needed: 3 }, party)).toEqual({ likes: 2, of: 3 });
    expect(nearMissFor({ likes: 4, of: 6, needed: 5 }, party)).toEqual({ likes: 4, of: 6 });
  });

  it('shows nothing below the line, at the rule, or under two likes', async () => {
    expect(nearMissFor({ likes: 2, of: 4, needed: 4 }, party)).toBeNull();
    expect(nearMissFor({ likes: 3, of: 3, needed: 3 }, party)).toBeNull();
    expect(nearMissFor({ likes: 1, of: 2, needed: 2 }, party)).toBeNull();
    expect(nearMissFor(undefined, party)).toBeNull();
  });

  it('shows nothing for a blind room or a film this player answered', async () => {
    const count = { likes: 2, of: 3, needed: 3 };
    expect(nearMissFor(count, { party: false, answered: false })).toBeNull();
    expect(nearMissFor(count, { party: true, answered: true })).toBeNull();
  });

  it('ignores a payload that is not a near miss', async () => {
    expect(parseNearMiss(null)).toBeNull();
    expect(parseNearMiss({ title_id: 1, likes: '2', of: 3, needed: 3 })).toBeNull();
    recordNearMiss(ROOM, { nope: true });
  });
});

describe('useNearMiss', () => {
  it('shows the near miss on the top card once it has settled', async () => {
    const { result } = await renderHook(() => useNearMiss(ROOM, 1));
    await send(miss(1));
    expect(result.current).toBeNull();
    await settle();
    expect(result.current).toEqual({ likes: 2, of: 3 });
  });

  it('shows nothing for a card further down until it is on top', async () => {
    const { result, rerender } = await renderHook(
      (props: { top: number }) => useNearMiss(ROOM, props.top),
      { initialProps: { top: 1 } },
    );
    await settle();
    await send(miss(2));
    expect(result.current).toBeNull();
    await rerender({ top: 2 });
    expect(result.current).toBeNull();
    await settle();
    expect(result.current).toEqual({ likes: 2, of: 3 });
  });

  it('shows nothing for a film this player answered', async () => {
    const { result } = await renderHook(() => useNearMiss(ROOM, 1, () => true));
    await send(miss(1));
    await settle();
    expect(result.current).toBeNull();
  });

  it('raises the number in place when a new count arrives', async () => {
    const { result } = await renderHook(() => useNearMiss(ROOM, 1));
    await send(miss(1, 3, 5, 4));
    await settle();
    expect(result.current).toEqual({ likes: 3, of: 5 });
    await send(miss(1, 3, 6, 4));
    expect(result.current).toEqual({ likes: 3, of: 6 });
  });

  it('hides when a corrected count drops below the line', async () => {
    const { result } = await renderHook(() => useNearMiss(ROOM, 1));
    await send(miss(1, 3, 5, 4));
    await settle();
    expect(result.current).not.toBeNull();
    await send(miss(1, 2, 5, 4));
    expect(result.current).toBeNull();
  });

  it('shows nothing in a blind room', async () => {
    mockRoom.data = { reveal: 'blind' };
    const { result } = await renderHook(() => useNearMiss(ROOM, 1));
    await send(miss(1));
    await settle();
    expect(result.current).toBeNull();
  });

  it('shows nothing when the card leaves and the next one has no count', async () => {
    const { result, rerender } = await renderHook(
      (props: { top: number | undefined }) => useNearMiss(ROOM, props.top),
      { initialProps: { top: 1 as number | undefined } },
    );
    await send(miss(1));
    await settle();
    expect(result.current).not.toBeNull();
    await rerender({ top: 2 });
    expect(result.current).toBeNull();
    await settle();
    expect(result.current).toBeNull();
  });

  it('keeps nothing for another room', async () => {
    const { result } = await renderHook(() => useNearMiss('other', 1));
    act(() => recordNearMiss(ROOM, miss(1)));
    await settle();
    expect(result.current).toBeNull();
  });
});

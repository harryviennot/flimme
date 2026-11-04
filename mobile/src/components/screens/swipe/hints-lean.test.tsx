import { act, renderHook } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { makeMutable } from 'react-native-reanimated';

import { LEAN_SHARE, commitLines } from '@/features/swipe/feel';
import { registerTopCard, type CardMotion } from '@/features/swipe/top-card';
import { duration } from '@/theme/motion';

import { useLean } from './hints';

// The card 1 lean (moments.md#first-game-hints-m618). Reanimated's test build finishes
// animations at once, so these tests read the animation the hook builds for the card's x:
// what it is made of, when it starts, how far it leans, and that it runs once. The finger
// cancelling it is the card's own pan gesture (cancelAnimation on touch), covered by the
// touch run.

let mockReduced = false;
const mockSet = jest.fn();
const mockDelay = jest.fn();
const mockTiming = jest.fn();
const mockSpring = jest.fn();

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    useReducedMotion: () => mockReduced,
    withDelay: (...args: unknown[]) => {
      mockDelay(...args);
      return { delayed: args };
    },
    withSequence: (...args: unknown[]) => ({ sequence: args }),
    withTiming: (...args: unknown[]) => {
      mockTiming(...args);
      return { timing: args };
    },
    withSpring: (...args: unknown[]) => {
      mockSpring(...args);
      return { spring: args };
    },
  };
});

function fakeMotion(): CardMotion {
  return {
    x: { set: mockSet, get: () => 0 } as unknown as CardMotion['x'],
    y: makeMutable(0),
    forced: makeMutable(0),
    forcedProgress: makeMutable(0),
  };
}

const window = Dimensions.get('window');
const reach = commitLines(window.width, window.height).x * LEAN_SHARE;

beforeEach(() => {
  mockReduced = false;
  mockSet.mockClear();
  mockDelay.mockClear();
  mockTiming.mockClear();
  mockSpring.mockClear();
  registerTopCard(null);
});

describe('the card 1 lean', () => {
  it('waits the hint delay, then leans right and left, once, a third of the way to the commit line', async () => {
    const motion = fakeMotion();
    registerTopCard(motion);
    const { rerender } = await renderHook(({ active }) => useLean(active), {
      initialProps: { active: true },
    });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockDelay.mock.calls[0]?.[0]).toBe(duration['hint-delay']);
    const targets = mockTiming.mock.calls.map((call) => call[0]);
    expect(targets).toEqual([reach, -reach]);
    for (const call of mockTiming.mock.calls) expect(call[1].duration).toBe(duration.slow);
    // It comes back to the middle by the card's spring.
    expect(mockSpring.mock.calls.map((call) => call[0])).toEqual([0]);
    // Once only: a later render, or the hint staying on, never starts it again.
    await rerender({ active: true });
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the swipe hint is not showing or there is no card on top', async () => {
    await renderHook(() => useLean(false));
    registerTopCard(fakeMotion());
    expect(mockSet).not.toHaveBeenCalled();
    await renderHook(() => useLean(true));
    expect(mockSet).toHaveBeenCalledTimes(1);
    await act(async () => registerTopCard(null));
    mockSet.mockClear();
    await renderHook(() => useLean(true));
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('starts inside a delay on the card value, so a finger that cancels the card animations cancels it', async () => {
    registerTopCard(fakeMotion());
    await renderHook(() => useLean(true));
    const animation = mockSet.mock.calls[0]?.[0] as { delayed?: unknown };
    expect(animation.delayed).toBeDefined();
  });

  it('with Reduce Motion shows each stamp still for the slow duration: no spring, no slide', async () => {
    mockReduced = true;
    registerTopCard(fakeMotion());
    await renderHook(() => useLean(true));
    expect(mockSpring).not.toHaveBeenCalled();
    const timings = mockTiming.mock.calls;
    // Jumps to the stamp (1 ms) and back after holding it for `slow`, right then left.
    expect(timings.map((call) => call[0]).sort((a, b) => a - b)).toEqual([-reach, 0, reach]);
    for (const call of timings) expect(call[1].duration).toBe(1);
    const holds = mockDelay.mock.calls.map((call) => call[0]);
    expect(holds.sort((a, b) => a - b)).toEqual([duration.slow, duration['hint-delay']]);
  });
});

import { act, render } from '@testing-library/react-native';

import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

import { Countdown } from './countdown';

jest.mock('@/lib/haptics', () => ({ haptics: { countdown: jest.fn() } }));
jest.mock('@/lib/sound', () => ({
  playSound: jest.fn(async () => undefined),
  countdownSoundFor: (s: number) => (s <= 2 ? 'countdown-last' : 'countdown'),
}));
jest.mock('@/lib/server-time', () => ({ msUntil: jest.fn() }));

import { msUntil } from '@/lib/server-time';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

const at = (seconds: number) =>
  act(async () => {
    jest.mocked(msUntil).mockReturnValue(seconds * 1000);
    jest.advanceTimersByTime(250);
  });

describe('Countdown sounds', () => {
  it('ticks with the haptic for 5, 4, 3, then the last tick for 2 and 1, once each', async () => {
    jest.mocked(msUntil).mockReturnValue(7000);
    await render(<Countdown deadline="x" />);
    await at(6);
    expect(playSound).not.toHaveBeenCalled();
    for (const s of [5, 5, 4, 3, 2, 1, 1]) await at(s);
    expect(jest.mocked(playSound).mock.calls.map((c) => c[0])).toEqual([
      'countdown',
      'countdown',
      'countdown',
      'countdown-last',
      'countdown-last',
    ]);
    expect(haptics.countdown).toHaveBeenCalledTimes(5);
  });

  it('plays nothing once this phone locked in (tick off), and nothing at 0', async () => {
    jest.mocked(msUntil).mockReturnValue(7000);
    await render(<Countdown deadline="x" tick={false} />);
    for (const s of [5, 3, 1, 0]) await at(s);
    expect(playSound).not.toHaveBeenCalled();
    expect(haptics.countdown).not.toHaveBeenCalled();
  });

  it('plays nothing at 0 when still ticking', async () => {
    jest.mocked(msUntil).mockReturnValue(7000);
    await render(<Countdown deadline="x" />);
    await at(0);
    expect(playSound).not.toHaveBeenCalled();
  });
});

import { act, renderHook } from '@testing-library/react-native';

import { playSound, preloadSounds, releaseSounds } from '@/lib/sound';

import { clearLive, resetStartClaims } from './live-moments';
import { useRoomSounds } from './use-room-sounds';

jest.mock('@/lib/sound', () => ({
  playSound: jest.fn(async () => undefined),
  preloadSounds: jest.fn(),
  releaseSounds: jest.fn(),
  arriveSoundFor: (n: number) => `arrive-${n}`,
}));

type Handler = (payload: unknown) => void;

function fakeRealtime() {
  const handlers = new Map<string, Handler>();
  return {
    listen: (event: string, handler: Handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    emit: (event: string, payload: unknown = {}) => handlers.get(event)?.(payload),
  };
}

const seat = (id: string) => ({ member_id: id, left_at: null });

beforeEach(() => {
  jest.clearAllMocks();
  clearLive('r');
  resetStartClaims();
});

type Props = { state: 'lobby' | 'dealing' | 'swiping'; seats: ReturnType<typeof seat>[] };

async function setup(initial: Props) {
  const realtime = fakeRealtime();
  const hook = await renderHook(
    (props: Props) => useRoomSounds('r', props.state, props.seats, 'me', realtime as never),
    { initialProps: initial },
  );
  return { realtime, ...hook };
}

describe('useRoomSounds', () => {
  it('makes the room sounds on mount and frees them when the room ends', async () => {
    const { unmount } = await setup({ state: 'lobby', seats: [seat('me')] });
    expect(preloadSounds).toHaveBeenCalledWith('room');
    await unmount();
    expect(releaseSounds).toHaveBeenCalledWith('room');
    expect(releaseSounds).toHaveBeenCalledWith('finale');
  });

  it('plays the arrival note for a live member_joined, for the new count', async () => {
    const { realtime, rerender } = await setup({ state: 'lobby', seats: [seat('me'), seat('a')] });
    await act(async () => realtime.emit('member_joined'));
    await rerender({ state: 'lobby', seats: [seat('me'), seat('a'), seat('b')] });
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('arrive-3');
  });

  it('plays nothing for a re-read that finds a new seat without a member_joined', async () => {
    const { rerender } = await setup({ state: 'lobby', seats: [seat('me')] });
    await rerender({ state: 'lobby', seats: [seat('me'), seat('a')] });
    expect(playSound).not.toHaveBeenCalled();
  });

  it('plays nothing for the joiner own first read', async () => {
    const { realtime } = await setup({ state: 'lobby', seats: [seat('a'), seat('me')] });
    await act(async () => realtime.emit('member_joined'));
    expect(playSound).not.toHaveBeenCalled();
  });

  it('plays the start sound when a state_changed says dealing in the lobby, even if the re-read skips it', async () => {
    const { realtime, rerender } = await setup({ state: 'lobby', seats: [seat('me'), seat('a')] });
    await act(async () => realtime.emit('state_changed', { state: 'dealing' }));
    expect(playSound).toHaveBeenCalledWith('start');
    await rerender({ state: 'swiping', seats: [seat('me'), seat('a')] });
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('plays the start sound once when the event comes twice', async () => {
    const { realtime } = await setup({ state: 'lobby', seats: [seat('me'), seat('a')] });
    await act(async () => realtime.emit('state_changed', { state: 'dealing' }));
    await act(async () => realtime.emit('state_changed', { state: 'dealing' }));
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('plays no start sound for a cold start, a re-read, or a phone not in the lobby', async () => {
    const cold = await setup({ state: 'dealing', seats: [seat('me')] });
    await act(async () => cold.realtime.emit('state_changed', { state: 'dealing' }));
    await cold.unmount();
    const reread = await setup({ state: 'lobby', seats: [seat('me')] });
    await reread.rerender({ state: 'dealing', seats: [seat('me')] });
    expect(playSound).not.toHaveBeenCalled();
  });
});

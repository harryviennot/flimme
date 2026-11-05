import type { KeyValueStore } from '@/lib/storage';
import { createKeptRoomStore } from '@/features/room/kept-room';
import { createMatchShownStore } from '@/features/room/match-shown';
import { createSettingsStore } from '@/features/settings/store';
import { createHintsStore } from '@/features/swipe/hints';
import { createVoteQueue } from '@/features/swipe/vote-queue';

import { resetPersistedStore, wipeWith } from './wipe';

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

describe('the wipe', () => {
  it('signs out, clears everything, then starts a new guest, in that order', async () => {
    const order: string[] = [];
    await wipeWith({
      signOut: async () => void order.push('signOut'),
      clearLocal: [() => order.push('a'), () => order.push('b')],
      clearQueries: () => order.push('queries'),
      startGuest: async () => void order.push('guest'),
    });
    expect(order).toEqual(['signOut', 'a', 'b', 'queries', 'guest']);
  });

  it('resets analytics before it signs out', async () => {
    const order: string[] = [];
    await wipeWith({
      forgetAnalytics: () => void order.push('analytics'),
      signOut: async () => void order.push('signOut'),
      clearLocal: [() => order.push('a')],
      clearQueries: () => order.push('queries'),
      startGuest: async () => void order.push('guest'),
    });
    expect(order).toEqual(['analytics', 'signOut', 'a', 'queries', 'guest']);
  });

  it('still wipes when analytics throws', async () => {
    const guest = jest.fn(async () => undefined);
    await wipeWith({
      forgetAnalytics: () => {
        throw new Error('x');
      },
      signOut: async () => undefined,
      clearLocal: [],
      clearQueries: () => undefined,
      startGuest: guest,
    });
    expect(guest).toHaveBeenCalled();
  });

  it('still clears the rest when one store or the sign-out fails', async () => {
    const later = jest.fn();
    const guest = jest.fn(async () => undefined);
    await wipeWith({
      signOut: async () => {
        throw new Error('x');
      },
      clearLocal: [
        () => {
          throw new Error('disk');
        },
        later,
      ],
      clearQueries: jest.fn(),
      startGuest: guest,
    });
    expect(later).toHaveBeenCalled();
    expect(guest).toHaveBeenCalled();
  });

  it('puts every persisted store back to its first values and removes what it saved', () => {
    const kv = memoryKv();
    const settings = createSettingsStore(kv);
    const kept = createKeptRoomStore(kv);
    const shown = createMatchShownStore(kv);
    const hints = createHintsStore(kv);
    const queue = createVoteQueue({
      kv,
      castVote: () => new Promise(() => {}),
      undoLastVote: jest.fn(),
      refreshSession: jest.fn(),
      invalidateRoom: jest.fn(),
      report: jest.fn(),
      keptRoomId: () => 'r1',
    } as never);

    settings.getState().setHapticsEnabled(false);
    settings.getState().setAnalyticsChoice('off');
    kept.getState().keep({ id: 'r1', code: '123456' });
    hints.getState().finish('swipe');
    queue.enqueue({
      room_id: 'r1',
      member_id: 'm1',
      title_id: 1,
      answer: 'like',
      dwell_ms: 1,
      client_at: '2026-11-05T10:00:00.000Z',
      flipped: false,
    });
    expect(kv.getItemSync('flimme.room')).not.toBeNull();
    expect(queue.pending('r1')).toBe(1);

    for (const store of [settings, kept, shown, hints]) {
      resetPersistedStore(store as never);
    }
    queue.clear();

    expect(settings.getState().hapticsEnabled).toBe(true);
    expect(settings.getState().analyticsChoice).toBe('on');
    expect(kept.getState().room).toBeNull();
    expect(hints.getState().done.swipe).toBe(false);
    expect(queue.pending('r1')).toBe(0);
    for (const key of ['settings', 'room', 'match-shown', 'hints']) {
      expect(kv.getItemSync(`flimme.${key}`)).toBeNull();
    }
    expect(JSON.parse(kv.getItemSync('flimme.vote-queue') ?? '{}').state.votes).toEqual([]);
  });
});

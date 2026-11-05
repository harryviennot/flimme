import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { gamesStore } from '@/features/analytics/games';
import { PROFILE_CACHE_KEY, saveCachedProfile } from '@/features/profile/cache';
import { keptRoomStore } from '@/features/room/kept-room';
import { matchShownStore } from '@/features/room/match-shown';
import { startSession } from '@/features/session';
import { useSettingsStore } from '@/features/settings';
import { voteQueue } from '@/features/swipe';
import { useHintsStore } from '@/features/swipe/hints';
import { queryClient } from '@/lib/query-client';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { wipeLocalData } from './wipe-app';

const mockMemory = new Map<string, string>();
jest.mock('@/lib/storage', () => ({
  storage: {
    getItemSync: (key: string) => mockMemory.get(key) ?? null,
    setItemSync: (key: string, value: string) => void mockMemory.set(key, value),
    removeItemSync: (key: string) => void mockMemory.delete(key),
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: jest.fn(async () => ({ error: null })) } },
}));
jest.mock('@/features/session', () => ({ startSession: jest.fn(async () => ({ status: 'ok' })) }));
jest.mock('@/api', () => ({ api: {} }));

describe('wipeLocalData, on the real stores', () => {
  it('signs out on this phone, empties every store and the profile copy, then starts a new guest', async () => {
    useSettingsStore.getState().setHapticsEnabled(false);
    useSettingsStore.getState().setAnalyticsChoice('off');
    keptRoomStore.getState().keep({ id: 'r1', code: '123456' });
    matchShownStore.getState().mark('r1');
    useHintsStore.getState().finish('swipe');
    gamesStore.getState().countGame('r1');
    saveCachedProfile({
      id: 'u1',
      display_name: 'Léa',
      avatar_key: 'teal',
      country: 'FR',
      language: 'fr',
      created_at: '2026-11-03T00:00:00Z',
    });
    queryClient.setQueryData(['my_profile'], { id: 'u1' });
    expect(storage.getItemSync(PROFILE_CACHE_KEY)).not.toBeNull();

    await wipeLocalData();

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useSettingsStore.getState().hapticsEnabled).toBe(true);
    expect(useSettingsStore.getState().analyticsChoice).toBe('on');
    expect(keptRoomStore.getState().room).toBeNull();
    expect(matchShownStore.getState().rooms).toEqual([]);
    expect(useHintsStore.getState().done.swipe).toBe(false);
    expect(gamesStore.getState().played).toBe(0);
    expect(voteQueue.pending('r1')).toBe(0);
    expect(storage.getItemSync(PROFILE_CACHE_KEY)).toBeNull();
    expect(queryClient.getQueryData(['my_profile'])).toBeUndefined();
    for (const name of ['settings', 'room', 'match-shown', 'hints', 'games']) {
      expect(storage.getItemSync(`flimme.${name}`)).toBeNull();
    }
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('knows every persisted store: a new one must join the wipe', () => {
    const wiped = new Set([
      'settings',
      'room',
      'match-shown',
      'hints',
      'games',
      'vote-queue',
      'solo-cap',
      'solo-leaves',
      'dev',
    ]);
    const root = join(__dirname, '..');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
          const text = readFileSync(path, 'utf8');
          for (const match of text.matchAll(/persistOptions<[^>]*>\(\{[^}]*?name: '([^']+)'/gs)) {
            found.push(`${match[1]} (${relative(root, path)})`);
          }
        }
      }
    };
    walk(root);
    const unknown = found.filter((f) => !wiped.has(f.split(' ')[0] ?? ''));
    expect(unknown).toEqual([]);
    expect(found.length).toBeGreaterThanOrEqual(5);
  });
});

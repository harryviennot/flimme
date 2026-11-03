import { ApiError, type MyProfile } from '@flimme/contract';
import { QueryClient } from '@tanstack/react-query';

import type { KeyValueStore } from '@/lib/storage';

import { readCachedProfile } from './cache';
import { applySavedProfile, initialColor, isNameValid, submitName, type SubmitDeps } from './name';
import { MY_PROFILE_KEY } from './use-my-profile';

jest.mock('@/api', () => ({ api: {} }));

const profile: MyProfile = {
  id: 'u1',
  display_name: '',
  avatar_key: 'default',
  country: 'FR',
  language: 'fr',
  created_at: '2026-11-03T00:00:00Z',
};

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
    getItemSync: (key) => data.get(key) ?? null,
    setItemSync: (key, value) => void data.set(key, value),
    removeItemSync: (key) => void data.delete(key),
  };
}

describe('isNameValid', () => {
  it.each([
    ['', false],
    ['   ', false],
    ['a', true],
    ['  Léa  ', true],
    ['a'.repeat(24), true],
    ['a'.repeat(25), false],
    ['🎬', true],
    ['🎬'.repeat(24), true],
  ])('%j is %s', (name, expected) => {
    expect(isNameValid(name)).toBe(expected);
  });
});

describe('initialColor', () => {
  it('draws one of the six on a first open, and more than one over many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i += 1) seen.add(initialColor(false, 'default', Math.random));
    expect(seen.size).toBeGreaterThan(1);
    for (const color of seen) {
      expect(['blue', 'green', 'gold', 'red', 'violet', 'teal']).toContain(color);
    }
  });

  it('keeps the current color when editing, and blue for a key that is not one of the six', () => {
    expect(initialColor(true, 'teal', () => 0)).toBe('teal');
    expect(initialColor(true, 'default', () => 0.9)).toBe('blue');
    expect(initialColor(true, 'fox', () => 0.9)).toBe('blue');
  });
});

describe('submitName', () => {
  const deps = (answer: () => Promise<unknown>, onlineNow = true): SubmitDeps => ({
    online: onlineNow,
    updateProfile: jest.fn(answer) as SubmitDeps['updateProfile'],
  });

  it('sends the trimmed name and the color, and returns the saved profile', async () => {
    const d = deps(async () => ({ status: 'ok', display_name: 'Léa', avatar_key: 'red' }));
    await expect(submitName('  Léa ', 'red', d)).resolves.toEqual({
      kind: 'saved',
      display_name: 'Léa',
      avatar_key: 'red',
    });
    expect(d.updateProfile).toHaveBeenCalledWith({ display_name: 'Léa', avatar_key: 'red' });
  });

  it('answers each refusal with its own outcome', async () => {
    await expect(
      submitName(
        'x',
        'red',
        deps(async () => ({ status: 'invalid_name' })),
      ),
    ).resolves.toEqual({ kind: 'invalid' });
    await expect(
      submitName(
        'x',
        'red',
        deps(async () => ({ status: 'name_not_allowed' })),
      ),
    ).resolves.toEqual({ kind: 'notAllowed' });
    await expect(
      submitName(
        'x',
        'red',
        deps(async () => ({ status: 'unknown_avatar' })),
      ),
    ).resolves.toEqual({ kind: 'failed' });
  });

  it('sends nothing while offline', async () => {
    const d = deps(async () => ({ status: 'ok' }), false);
    await expect(submitName('Léa', 'red', d)).resolves.toEqual({ kind: 'offline' });
    expect(d.updateProfile).not.toHaveBeenCalled();
  });

  it('maps a network failure to offline and anything else to failed', async () => {
    const reject = (kind: 'network' | 'unexpected') =>
      deps(async () => {
        throw new ApiError(kind, 'update_profile', 'x');
      });
    await expect(submitName('Léa', 'red', reject('network'))).resolves.toEqual({
      kind: 'offline',
    });
    await expect(submitName('Léa', 'red', reject('unexpected'))).resolves.toEqual({
      kind: 'failed',
    });
  });
});

describe('applySavedProfile', () => {
  it('puts the normalised name and avatar in the query and on the device', () => {
    const client = new QueryClient();
    const kv = memoryStore();
    client.setQueryData(MY_PROFILE_KEY, profile);
    applySavedProfile(client, { display_name: 'Léa', avatar_key: 'teal' }, kv);
    const expected = { ...profile, display_name: 'Léa', avatar_key: 'teal' };
    expect(client.getQueryData(MY_PROFILE_KEY)).toEqual(expected);
    expect(readCachedProfile(kv)).toEqual(expected);
  });

  it('leaves the query to refetch when no profile was read yet', () => {
    const client = new QueryClient();
    const kv = memoryStore();
    applySavedProfile(client, { display_name: 'Léa', avatar_key: 'teal' }, kv);
    expect(client.getQueryData(MY_PROFILE_KEY)).toBeUndefined();
    expect(readCachedProfile(kv)).toBeNull();
  });
});

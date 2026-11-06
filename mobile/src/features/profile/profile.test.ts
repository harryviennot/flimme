import type { MyProfile } from '@flimme/contract';

import type { KeyValueStore } from '@/lib/storage';

import { readCachedProfile, saveCachedProfile } from './cache';
import { deviceProfileChanges, toAvatarColor } from './device';

const profile: MyProfile = {
  id: 'u1',
  display_name: 'Léa',
  avatar_key: 'teal',
  country: null,
  language: 'en',
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

describe('deviceProfileChanges', () => {
  it('sends the country while the profile has none', () => {
    expect(
      deviceProfileChanges({ country: null, language: 'fr' }, { regionCode: 'FR', language: 'fr' }),
    ).toEqual({
      country: 'FR',
    });
  });

  it('never overwrites a country, and ignores a missing or numeric region', () => {
    const device = { regionCode: 'FR', language: 'fr' };
    expect(deviceProfileChanges({ country: 'BE', language: 'fr' }, device)).toBeNull();
    expect(
      deviceProfileChanges({ country: null, language: 'fr' }, { regionCode: null, language: 'fr' }),
    ).toBeNull();
    expect(
      deviceProfileChanges(
        { country: null, language: 'fr' },
        { regionCode: '419', language: 'fr' },
      ),
    ).toBeNull();
    expect(
      deviceProfileChanges({ country: null, language: 'fr' }, { regionCode: 'fr', language: 'fr' }),
    ).toBeNull();
  });

  it('sends the language whenever it differs, and nothing when it matches', () => {
    expect(
      deviceProfileChanges({ country: 'FR', language: 'en' }, { regionCode: 'FR', language: 'fr' }),
    ).toEqual({ language: 'fr' });
    expect(
      deviceProfileChanges({ country: 'FR', language: 'fr' }, { regionCode: 'FR', language: 'fr' }),
    ).toBeNull();
  });

  it('carries both in one call when both are due', () => {
    expect(deviceProfileChanges(profile, { regionCode: 'FR', language: 'fr' })).toEqual({
      country: 'FR',
      language: 'fr',
    });
  });
});

describe('deviceProfileChanges, mending a country without a catalog', () => {
  const catalog = ['FR'];
  const fr = { regionCode: 'FR', language: 'fr' };

  it('saves the region when the saved country has no catalog and the region has one', () => {
    expect(deviceProfileChanges({ country: 'US', language: 'fr' }, fr, catalog)).toEqual({
      country: 'FR',
    });
  });

  it('never overwrites a country that has a catalog (the player may have chosen it)', () => {
    expect(deviceProfileChanges({ country: 'BE', language: 'fr' }, fr, ['FR', 'BE'])).toBeNull();
  });

  it('leaves a country without a catalog when the region has none either', () => {
    expect(
      deviceProfileChanges(
        { country: 'US', language: 'fr' },
        { regionCode: 'DE', language: 'fr' },
        catalog,
      ),
    ).toBeNull();
  });

  it('does nothing about the country while the catalog list is unknown', () => {
    expect(deviceProfileChanges({ country: 'US', language: 'fr' }, fr, null)).toBeNull();
  });
});

describe('toAvatarColor', () => {
  it.each(['blue', 'green', 'gold', 'red', 'violet', 'teal'] as const)('keeps %s', (color) => {
    expect(toAvatarColor(color)).toBe(color);
  });

  it.each(['default', 'fox', '', 'Blue'])('draws %j as blue', (key) => {
    expect(toAvatarColor(key)).toBe('blue');
  });
});

describe('the cached profile', () => {
  it('is read back as saved', () => {
    const kv = memoryStore();
    expect(readCachedProfile(kv)).toBeNull();
    saveCachedProfile(profile, kv);
    expect(readCachedProfile(kv)).toEqual(profile);
  });

  it('ignores a copy that no longer fits', () => {
    const kv = memoryStore();
    kv.setItemSync('flimme.my_profile', '{"id":1}');
    expect(readCachedProfile(kv)).toBeNull();
    kv.setItemSync('flimme.my_profile', 'not json');
    expect(readCachedProfile(kv)).toBeNull();
  });
});

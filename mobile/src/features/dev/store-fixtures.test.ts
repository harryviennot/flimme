import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  isStoreScene,
  metaOf,
  STORE_FILMS,
  STORE_PLAYERS,
  STORE_ROOM_CODE,
  STORE_SCENES,
  storeLanguage,
} from './store-fixtures';

const MOBILE = path.resolve(__dirname, '../../..');
const STORE_DOCS = path.resolve(MOBILE, '../docs/store');

// docs/store/screenshots.md: the six scenes, in store-listing.md's order, with fictional art only.

describe('the store scenes', () => {
  it('are the six of store-listing.md, in its order', () => {
    expect(STORE_SCENES).toEqual(['swipe', 'match', 'lobby', 'card-back', 'final-cut', 'recap']);
  });

  it('only name a scene that exists', () => {
    expect(isStoreScene('swipe')).toBe(true);
    expect(isStoreScene('gallery')).toBe(false);
    expect(isStoreScene(undefined)).toBe(false);
  });

  it('read French unless English is asked for', () => {
    expect(storeLanguage('en')).toBe('en');
    expect(storeLanguage('fr')).toBe('fr');
    expect(storeLanguage('de')).toBe('fr');
    expect(storeLanguage(undefined)).toBe('fr');
  });
});

describe('the fixtures', () => {
  it('use only the design posters', () => {
    const files = fs.readdirSync(path.join(MOBILE, 'assets/posters'));
    for (const film of STORE_FILMS) expect(files).toContain(film.posterFile);
  });

  it('use a fictional code and fictional players', () => {
    expect(STORE_ROOM_CODE).toMatch(/^\d{6}$/);
    expect(STORE_PLAYERS.map((p) => p.name)).toEqual(['Léa', 'Sam', 'Jo', 'Maya']);
  });

  it('format the meta line in the language', () => {
    const film = STORE_FILMS[0]!;
    expect(metaOf(film, 'fr')).toBe('2021 · 1 h 52 · Drame · ★ 7,8');
    expect(metaOf(film, 'en')).toBe('2021 · 1h 52m · Drama · ★ 7.8');
  });
});

describe('the captions and the images', () => {
  const text = fs.readFileSync(path.join(STORE_DOCS, 'screenshots.md'), 'utf8');
  const rows = text
    .split('\n')
    .filter((line) => line.startsWith('| 0'))
    .map((line) => line.split('|').map((cell) => cell.trim()));

  it('have one row per scene, in order, in both languages', () => {
    expect(rows.map((r) => r[2])).toEqual([...STORE_SCENES]);
    rows.forEach((r, i) => {
      expect(r[1]).toBe(`0${i + 1}`);
      expect(r[3]!.length).toBeGreaterThan(0);
      expect(r[4]!.length).toBeGreaterThan(0);
    });
  });

  it('follow the writing rules', () => {
    expect(text).not.toMatch(/[–—]/);
    for (const r of rows) {
      for (const caption of [r[3]!, r[4]!]) {
        expect(caption).not.toMatch(/for kids|pour (les )?enfants/i);
        expect(caption.length).toBeLessThanOrEqual(60);
      }
    }
  });

  // [directory, width, height]
  const sets: [string, number, number][] = [
    ['app-store', 1206, 2622],
    ['google-play', 1080, 1920],
  ];

  for (const [store, width, height] of sets) {
    for (const lang of ['fr', 'en']) {
      it(`${store}/${lang} holds six ${width} by ${height} PNGs without alpha`, () => {
        const dir = path.join(STORE_DOCS, 'screenshots', store, lang);
        const expected = STORE_SCENES.map((scene, i) => `0${i + 1}-${scene}.png`);
        expect(fs.readdirSync(dir).sort()).toEqual(expected);
        for (const name of expected) {
          const bytes = fs.readFileSync(path.join(dir, name));
          expect(bytes.subarray(1, 4).toString()).toBe('PNG');
          expect(bytes.readUInt32BE(16)).toBe(width);
          expect(bytes.readUInt32BE(20)).toBe(height);
          // Colour type 2 is RGB; 6 is RGBA. Apple refuses an alpha channel.
          expect(bytes[25]).toBe(2);
        }
      });
    }
  }

  it('keep Play within its limits (long side at most twice the short side)', () => {
    expect(1920 / 1080).toBeLessThanOrEqual(2);
  });
});

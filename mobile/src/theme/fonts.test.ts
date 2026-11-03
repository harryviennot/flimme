import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import createConfig from '../../app.config';
import fontList from './fonts.json';
import { tokens } from './generated/tokens';

const root = join(__dirname, '..', '..');

type FontPlugin = {
  ios: { fonts: string[] };
  android: { fonts: { fontFamily: string; fontDefinitions: { path: string; weight: number }[] }[] };
};

function fontPlugin(): FontPlugin {
  const config = createConfig({ config: {} as never } as never);
  const entry = (config.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-font');
  if (!Array.isArray(entry)) throw new Error('app.config.ts has no expo-font plugin');
  return entry[1] as FontPlugin;
}

describe('embedded fonts', () => {
  it('declares every fontFamily the theme uses in the expo-font plugin, on both platforms', () => {
    const plugin = fontPlugin();
    const android = plugin.android.fonts.map((f) => f.fontFamily);
    const families = new Set(Object.values(tokens.typography).map((t) => t.fontFamily));
    expect(families.size).toBeGreaterThan(0);
    for (const family of families) {
      const font = fontList.fonts.find((f) => f.postScriptName === family);
      expect(font).toBeDefined();
      expect(android).toContain(family);
      expect(plugin.ios.fonts).toContain(`./${font?.file}`);
    }
  });

  it('names each font by the PostScript name inside its file', () => {
    for (const font of fontList.fonts) {
      const bytes = readFileSync(join(root, font.file));
      // The name table stores the name as UTF-16 big endian; ASCII names make this simple.
      const utf16 = Buffer.from(font.postScriptName, 'utf16le').swap16();
      expect(bytes.includes(utf16)).toBe(true);
    }
  });

  it('keeps a licence file next to every font file', () => {
    const folder = join(root, 'assets', 'fonts');
    const files = readdirSync(folder);
    for (const font of fontList.fonts) {
      expect(existsSync(join(root, font.licence))).toBe(true);
      expect(font.licence.startsWith('assets/fonts/')).toBe(true);
    }
    for (const file of files.filter((f) => f.endsWith('.ttf'))) {
      expect(fontList.fonts.some((f) => f.file === `assets/fonts/${file}`)).toBe(true);
    }
    const licence = readFileSync(join(folder, 'Staatliches-OFL.txt'), 'utf8');
    expect(licence).toContain('SIL Open Font License');
  });
});

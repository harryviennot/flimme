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

/** The PostScript name (name table, nameID 6) of a TrueType file. */
function postScriptName(bytes: Buffer): string | undefined {
  const tables = bytes.readUInt16BE(4);
  for (let i = 0; i < tables; i += 1) {
    const entry = 12 + i * 16;
    if (bytes.toString('latin1', entry, entry + 4) !== 'name') continue;
    const table = bytes.readUInt32BE(entry + 8);
    const count = bytes.readUInt16BE(table + 2);
    const strings = table + bytes.readUInt16BE(table + 4);
    for (let j = 0; j < count; j += 1) {
      const record = table + 6 + j * 12;
      if (bytes.readUInt16BE(record + 6) !== 6 || bytes.readUInt16BE(record) !== 3) continue;
      const length = bytes.readUInt16BE(record + 8);
      const offset = strings + bytes.readUInt16BE(record + 10);
      return Buffer.from(bytes.subarray(offset, offset + length))
        .swap16()
        .toString('utf16le');
    }
  }
  return undefined;
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
      expect(postScriptName(readFileSync(join(root, font.file)))).toBe(font.postScriptName);
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

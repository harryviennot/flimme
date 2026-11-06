import fs from 'node:fs';
import path from 'node:path';

import { errorFeedback } from './feedback';
import { haptics } from './haptics';
import { playSound } from './sound';

jest.mock('./haptics', () => ({ haptics: { error: jest.fn() } }));
jest.mock('./sound', () => ({ playSound: jest.fn(async () => undefined) }));

describe('errorFeedback', () => {
  it('fires the error haptic and the error sound together', () => {
    errorFeedback();
    expect(haptics.error).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('error');
  });
});

describe('every refusal has the error sound', () => {
  const src = path.join(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });

  it('has no haptics.error() call outside lib/', () => {
    const offenders = walk(src)
      .filter((file) => !file.startsWith(path.join(src, 'lib') + path.sep))
      .filter((file) => /haptics\.error\(/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(src, file));
    expect(offenders).toEqual([]);
  });
});

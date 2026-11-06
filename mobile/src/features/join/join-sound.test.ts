import fs from 'node:fs';
import path from 'node:path';

// Every way into a room plays the join sound when `join_room` answers ok, and only then
// (sounds.md#joining-a-room): the code screen, the join sheet and the winner's Join offer. The
// code screen's hook has its own behaviour test (use-join-attempt.test.tsx); this keeps the
// other two in step with it.
describe('the join sound on every join path', () => {
  const src = path.join(__dirname, '..', '..');
  const read = (p: string) => fs.readFileSync(path.join(src, p), 'utf8');
  const paths = [
    'features/join/use-join-attempt.ts',
    'features/join/use-join-link.ts',
    'features/play-again/use-join-offer.ts',
  ];

  it.each(paths)('%s plays it once, right after the ok', (file) => {
    const text = read(file);
    expect(text.match(/playSound\('join'\)/g)).toHaveLength(1);
    expect(text).toMatch(/result\.status === 'ok'\) \{\s*\/\/[^\n]*\n\s*void playSound\('join'\);/);
  });

  it('is played nowhere else', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
      });
    const users = walk(src)
      .filter((file) => /playSound\('join'\)/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(src, file))
      .sort();
    expect(users).toEqual([...paths].sort());
  });
});

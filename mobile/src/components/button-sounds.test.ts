import fs from 'node:fs';
import path from 'node:path';

// The tap sound belongs to three buttons only (sounds.md#key-buttons): Join (the sheet and its
// name step), Start swiping and Lock in. Every other button stays silent.
describe('which buttons play the tap', () => {
  const root = path.join(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx$/.test(entry.name) && !/\.(test|gallery)\./.test(entry.name) ? [full] : [];
    });

  it('sets sound="tap" on exactly Join (twice), Start swiping and Lock in', () => {
    const uses = walk(root).flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      const count = (text.match(/\bsound="tap"/g) ?? []).length;
      return count ? [[path.relative(root, file), count] as const] : [];
    });
    expect(Object.fromEntries(uses)).toEqual({
      'components/screens/final-cut/lock-in-footer.tsx': 1,
      'components/screens/join-sheet/join-sheet.tsx': 2,
      'components/screens/lobby/lobby-footer.tsx': 1,
    });
  });

  it('puts each tap on the right button', () => {
    const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
    expect(read('components/screens/lobby/lobby-footer.tsx')).toMatch(
      /label=\{t\('start\.cta'\)\}\s+sound="tap"/,
    );
    expect(read('components/screens/final-cut/lock-in-footer.tsx')).toMatch(/sound="tap"/);
    expect(
      read('components/screens/join-sheet/join-sheet.tsx').match(
        /link\.join'\)\}[^>]*?sound="tap"/gs,
      ),
    ).toHaveLength(2);
  });
});

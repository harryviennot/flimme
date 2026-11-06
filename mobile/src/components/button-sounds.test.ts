import fs from 'node:fs';
import path from 'node:path';

// Button sounds belong to three buttons only (sounds.md#key-buttons): the tick on Join (the sheet
// and its name step) and Start swiping, the latch on Lock in. Every other button stays silent.
describe('which buttons play a sound', () => {
  const root = path.join(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx$/.test(entry.name) && !/\.(test|gallery)\./.test(entry.name) ? [full] : [];
    });
  const uses = (pattern: RegExp) =>
    Object.fromEntries(
      walk(root).flatMap((file) => {
        const count = (fs.readFileSync(file, 'utf8').match(pattern) ?? []).length;
        return count ? [[path.relative(root, file), count] as const] : [];
      }),
    );

  it('sets sound="tap" on exactly Join (twice) and Start swiping', () => {
    expect(uses(/\bsound="tap"/g)).toEqual({
      'components/screens/join-sheet/join-sheet.tsx': 2,
      'components/screens/lobby/lobby-footer.tsx': 1,
    });
  });

  it('sets sound="lock-in" on Lock in only', () => {
    expect(uses(/\bsound="lock-in"/g)).toEqual({
      'components/screens/final-cut/lock-in-footer.tsx': 1,
    });
  });

  it('sets no other sound on a button', () => {
    expect(uses(/\bsound=(?!"tap"|"lock-in"|\{sound\})/g)).toEqual({});
  });

  it('puts each sound on the right button', () => {
    const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
    expect(read('components/screens/lobby/lobby-footer.tsx')).toMatch(
      /label=\{t\('start\.cta'\)\}\s+sound="tap"/,
    );
    expect(read('components/screens/final-cut/lock-in-footer.tsx')).toMatch(
      /lockIn[^>]*?sound="lock-in"/s,
    );
    expect(
      read('components/screens/join-sheet/join-sheet.tsx').match(
        /link\.join'\)\}[^>]*?sound="tap"/gs,
      ),
    ).toHaveLength(2);
  });
});

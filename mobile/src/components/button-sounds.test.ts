import fs from 'node:fs';
import path from 'node:path';

// Every button ticks (sounds.md#key-buttons): `Button` and `Pressable` play the tap on press-in by
// default, unless disabled or loading, and a press with no haptic stays silent. Lock in plays its
// own latch instead. The behaviour is tested in button.test.tsx and pressable.test.tsx; this pins
// the wiring.
describe('which buttons play a sound', () => {
  const root = path.join(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
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

  it('ticks by default in Pressable, which Button is built on', () => {
    const pressable = read('components/ui/pressable.tsx');
    expect(pressable).toMatch(/sound = haptic === false \? false : 'tap'/);
    expect(pressable).toMatch(/if \(sound && !disabled\) void playSound\(sound\)/);
    expect(read('components/ui/button.tsx')).toMatch(/<Pressable[\s\S]*disabled=\{inactive\}/);
  });

  it('needs no screen to ask for the tap', () => {
    expect(uses(/\bsound="tap"/g)).toEqual({});
  });

  it('sets sound="lock-in" on Lock in only', () => {
    expect(uses(/\bsound="lock-in"/g)).toEqual({
      'components/screens/final-cut/lock-in-footer.tsx': 1,
    });
    expect(read('components/screens/final-cut/lock-in-footer.tsx')).toMatch(
      /lockIn[^>]*?sound="lock-in"/s,
    );
  });

  it('turns a sound off only with false', () => {
    expect(uses(/\bsound=(?!"lock-in"|\{false\}|\{sound\})/g)).toEqual({});
  });

  it('keeps the swipe answer buttons ticking (one tick for every press reveals nothing)', () => {
    expect(read('components/shared/swipe-action.tsx')).not.toMatch(/sound=\{false\}/);
  });
});

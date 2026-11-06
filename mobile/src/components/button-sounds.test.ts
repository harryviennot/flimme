import fs from 'node:fs';
import path from 'node:path';

// Every button ticks (sounds.md#key-buttons): `Button` and `Pressable` play the tap on
// press-in by default, unless disabled or loading. A press with no haptic stays silent.
// The behaviour is tested in button.test.tsx and pressable.test.tsx; this pins the wiring.
describe('which buttons play the tap', () => {
  const root = path.join(__dirname, '..');
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.tsx$/.test(entry.name) && !/\.(test|gallery)\./.test(entry.name) ? [full] : [];
    });

  it('ticks by default in Pressable, which Button is built on', () => {
    const pressable = read('components/ui/pressable.tsx');
    expect(pressable).toMatch(/sound = haptic === false \? false : 'tap'/);
    expect(pressable).toMatch(/if \(sound && !disabled\) void playSound\(sound\)/);
    expect(read('components/ui/button.tsx')).toMatch(/<Pressable[\s\S]*disabled=\{inactive\}/);
  });

  it('needs no screen to ask for the tap', () => {
    const asked = walk(root).filter((file) => /\bsound="tap"/.test(fs.readFileSync(file, 'utf8')));
    expect(asked.map((file) => path.relative(root, file))).toEqual([]);
  });

  it('keeps the swipe answer buttons ticking (one tick for every press reveals nothing)', () => {
    expect(read('components/shared/swipe-action.tsx')).not.toMatch(/sound=\{false\}/);
  });
});

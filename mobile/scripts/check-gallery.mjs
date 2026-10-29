// Fails when a component in ui/ or shared/ has no gallery entry, or its entry isn't in
// gallery-registry.ts. The gallery is how agents and Harry see every component in every
// state, so nothing ships without one.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('../src/components/', import.meta.url).pathname;
// Not visual on their own: the touchable, the screen frame, full-screen fallbacks.
const exempt = new Set([
  'ui/pressable',
  'ui/screen',
  'shared/placeholder-screen',
  'shared/error-screen',
]);
const registry = readFileSync(`${root}gallery-registry.ts`, 'utf8');

const problems = [];
for (const tier of ['ui', 'shared']) {
  for (const file of readdirSync(root + tier)) {
    if (!file.endsWith('.tsx') || file.endsWith('.gallery.tsx') || file.endsWith('.test.tsx'))
      continue;
    const name = `${tier}/${file.replace(/\.tsx$/, '')}`;
    if (exempt.has(name)) continue;
    if (!existsSync(`${root}${name}.gallery.tsx`)) problems.push(`${name}: no ${name}.gallery.tsx`);
    else if (!registry.includes(`'./${name}.gallery'`))
      problems.push(`${name}: not in gallery-registry.ts`);
  }
}
if (problems.length) {
  console.error(`Gallery entries missing:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Gallery: every component has its entry.');

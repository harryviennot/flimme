#!/usr/bin/env node
// Prints one section of a doc instead of the whole file, to save tokens.
//   node tools/doc-section.mjs docs/architecture/data-model.md#the-room
//   node tools/doc-section.mjs ../architecture/security.md#checklist   (roadmap-style links
//     are resolved from docs/product/)
//   node tools/doc-section.mjs docs/product/game-modes.md --toc        (headings only)
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

import { ROOT } from './lib/roadmap.mjs';

const [target, flag] = process.argv.slice(2);
if (!target) {
  console.error('Usage: node tools/doc-section.mjs <path>#<anchor> | <path> --toc');
  process.exit(1);
}

const [rawPath, anchor] = target.split('#');
const candidates = [
  rawPath,
  join('docs', rawPath),
  join('docs/product', rawPath),
  join('docs/architecture', rawPath),
].map((p) => normalize(join(ROOT, p)));
const path = candidates.find((p) => existsSync(p));
if (!path) {
  console.error(`No such doc: ${rawPath}`);
  process.exit(1);
}

// GitHub's anchor rules: lower case, punctuation dropped, spaces to hyphens, repeats numbered.
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- _]/gu, '')
    .replace(/ /g, '-');
}

const lines = readFileSync(path, 'utf8').split('\n');
const headings = [];
const seen = new Map();
let inFence = false;
lines.forEach((line, index) => {
  if (line.startsWith('```')) inFence = !inFence;
  const m = !inFence && line.match(/^(#{1,6}) (.+)$/);
  if (!m) return;
  const base = slug(m[2]);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  headings.push({ level: m[1].length, text: m[2], slug: count ? `${base}-${count}` : base, index });
});

if (flag === '--toc' || !anchor) {
  for (const h of headings) console.log(`${'  '.repeat(h.level - 1)}${h.text}  #${h.slug}`);
  process.exit(0);
}

const start = headings.findIndex((h) => h.slug === anchor);
if (start === -1) {
  console.error(`No section #${anchor} in ${rawPath}. Run with --toc to list them.`);
  process.exit(1);
}
const end = headings.slice(start + 1).find((h) => h.level <= headings[start].level);
console.log(
  lines
    .slice(headings[start].index, end ? end.index : lines.length)
    .join('\n')
    .trimEnd(),
);

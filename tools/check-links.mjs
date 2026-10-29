#!/usr/bin/env node
// Checks that every relative link in the Markdown files points to a file that exists
// and, when it has one, to a heading that exists.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import { ROOT } from './lib/roadmap.mjs';

const SKIP = new Set(['node_modules', '.git', '.expo', 'dist', '.venv', 'archive']);

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

const slug = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- _]/gu, '')
    .replace(/ /g, '-');

const anchorCache = new Map();
function anchors(path) {
  if (!anchorCache.has(path)) {
    const set = new Set();
    const seen = new Map();
    let inFence = false;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.startsWith('```')) inFence = !inFence;
      const m = !inFence && line.match(/^#{1,6} (.+)$/);
      if (!m) continue;
      const base = slug(m[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      set.add(n ? `${base}-${n}` : base);
    }
    anchorCache.set(path, set);
  }
  return anchorCache.get(path);
}

const problems = [];
for (const file of markdownFiles(ROOT)) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(link)) continue;
    const [path, anchor] = link.split('#');
    const target = path ? normalize(join(dirname(file), decodeURI(path))) : file;
    const where = relative(ROOT, file);
    if (!existsSync(target)) {
      problems.push(`${where}: ${link} (no such file)`);
      continue;
    }
    if (anchor && target.endsWith('.md') && !anchors(target).has(anchor)) {
      problems.push(`${where}: ${link} (no such heading)`);
    }
  }
}

if (problems.length) {
  console.error(`Broken links:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('Links: all good.');

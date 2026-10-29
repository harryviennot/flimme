#!/usr/bin/env node
// Ticks roadmap tasks and refreshes the progress line and milestone statuses.
// Run by .github/workflows/roadmap.yml after a merge, with the pull request title:
//   node tools/roadmap-tick.mjs --title "M4.8 Join with a code"
//   node tools/roadmap-tick.mjs M4.8 M4.15
//   node tools/roadmap-tick.mjs --recount   (after adding or removing tasks)
import { readFileSync, writeFileSync } from 'node:fs';

import { ROADMAP, readRoadmap } from './lib/roadmap.mjs';

const args = process.argv.slice(2);
const titleAt = args.indexOf('--title');
const ids =
  titleAt === -1
    ? args.filter((a) => /^M\d+\.\d+$/.test(a))
    : [...(args[titleAt + 1] ?? '').matchAll(/\bM\d+\.\d+\b/g)].map((m) => m[0]);

if (!ids.length && !args.includes('--recount')) {
  console.log('No task id found: nothing to tick.');
  process.exit(0);
}

let text = readFileSync(ROADMAP, 'utf8');
const known = new Set(readRoadmap().map((t) => t.id));
const ticked = [];
for (const id of new Set(ids)) {
  if (!known.has(id)) {
    console.error(`Unknown task ${id}, skipped.`);
    continue;
  }
  const before = text;
  text = text.replace(`- [ ] **${id}** `, `- [x] **${id}** `);
  if (text !== before) ticked.push(id);
}
writeFileSync(ROADMAP, text);

// Recount from the file as it now stands.
const tasks = readRoadmap();
const done = tasks.filter((t) => t.done).length;
text = readFileSync(ROADMAP, 'utf8').replace(
  /^Progress: \d+ of \d+ tasks done\.$/m,
  `Progress: ${done} of ${tasks.length} tasks done.`,
);
const byMilestone = Map.groupBy(tasks, (t) => t.milestone);
text = text.replace(
  /^(\| \[(M\d+)\]\(#[^)]+\) \| [^|]+ \| [^|]+ \| )(\d+)( \| )([^|]+)( \|)$/gm,
  (row, head, milestone, _count, mid, _status, tail) => {
    const list = byMilestone.get(milestone) ?? [];
    const finished = list.filter((t) => t.done).length;
    const status =
      finished === 0 ? 'Not started' : finished === list.length ? 'Done' : 'In progress';
    return `${head}${list.length}${mid}${status}${tail}`;
  },
);
writeFileSync(ROADMAP, text);
console.log(
  ticked.length
    ? `Ticked ${ticked.join(', ')}. ${done} of ${tasks.length} done.`
    : 'Already ticked.',
);

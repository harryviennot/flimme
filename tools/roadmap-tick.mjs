#!/usr/bin/env node
// Ticks roadmap tasks and refreshes the progress line and milestone statuses.
// Run by .github/workflows/roadmap.yml after a merge, with the pull request title:
//   node tools/roadmap-tick.mjs --title "M4.8 Join with a code"
//   node tools/roadmap-tick.mjs M4.8 M4.15
//   node tools/roadmap-tick.mjs --recount   (after adding or removing tasks)
// A title ticks only the task it starts with. A title that starts with Docs, Chore, Fix or
// Bootstrap ticks nothing, whatever ids it mentions later.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ROADMAP, TASK, liveLines, parseRoadmap } from './lib/roadmap.mjs';

/** The task id a pull request title starts with, or null. */
export function taskIdFromTitle(title) {
  return title.trim().match(/^(M\d+\.\d+)\b/)?.[1] ?? null;
}

/**
 * Ticks each task on its own line. Lines inside a code block or an HTML comment are never
 * touched, so the format example stays as it is.
 */
export function tickTasks(text, ids) {
  const lines = text.split('\n');
  const live = liveLines(lines);
  const wanted = new Set(ids);
  const found = new Set();
  const ticked = [];
  lines.forEach((line, index) => {
    const match = live[index] && line.match(TASK);
    if (!match || !wanted.has(match[2])) return;
    found.add(match[2]);
    if (match[1] === 'x') return;
    lines[index] = line.replace('- [ ]', '- [x]');
    ticked.push(match[2]);
  });
  const unknown = [...wanted].filter((id) => !found.has(id));
  return { text: lines.join('\n'), ticked, unknown };
}

/** Refreshes the progress line and the milestone table from the tasks as they stand. */
export function recount(text) {
  const tasks = parseRoadmap(text);
  const done = tasks.filter((t) => t.done).length;
  const byMilestone = Map.groupBy(tasks, (t) => t.milestone);
  return text
    .replace(
      /^Progress: \d+ of \d+ tasks done\.$/m,
      `Progress: ${done} of ${tasks.length} tasks done.`,
    )
    .replace(
      /^(\| \[(M\d+)\]\(#[^)]+\) \| [^|]+ \| [^|]+ \| )(\d+)( \| )([^|]+)( \|)$/gm,
      (row, head, milestone, _count, mid, _status, tail) => {
        const list = byMilestone.get(milestone) ?? [];
        const finished = list.filter((t) => t.done).length;
        const status =
          finished === 0 ? 'Not started' : finished === list.length ? 'Done' : 'In progress';
        return `${head}${list.length}${mid}${status}${tail}`;
      },
    );
}

function main(args) {
  const titleAt = args.indexOf('--title');
  let ids;
  if (titleAt === -1) ids = args.filter((a) => /^M\d+\.\d+$/.test(a));
  else {
    const id = taskIdFromTitle(args[titleAt + 1] ?? '');
    ids = id ? [id] : [];
  }
  if (!ids.length && !args.includes('--recount')) {
    console.log(
      titleAt === -1
        ? 'No task id given: nothing to tick.'
        : "The title doesn't start with a task id: nothing to tick.",
    );
    return;
  }

  const before = readFileSync(ROADMAP, 'utf8');
  const result = tickTasks(before, ids);
  for (const id of result.unknown) console.error(`Unknown task ${id}, skipped.`);
  const after = recount(result.text);
  if (after !== before) writeFileSync(ROADMAP, after);

  const tasks = parseRoadmap(after);
  const done = tasks.filter((t) => t.done).length;
  console.log(
    result.ticked.length
      ? `Ticked ${result.ticked.join(', ')}. ${done} of ${tasks.length} done.`
      : `Nothing newly ticked. ${done} of ${tasks.length} done.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));

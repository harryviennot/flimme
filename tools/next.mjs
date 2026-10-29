#!/usr/bin/env node
// Lists roadmap tasks that can start now: open, with every "needs" done.
//   node tools/next.mjs                 every ready task
//   node tools/next.mjs --milestone M4  only one milestone
//   node tools/next.mjs --type app      only one type of work
//   node tools/next.mjs --task M4.8     one task in full, for a session to start from
//   node tools/next.mjs --json
import { readRoadmap, readyTasks } from './lib/roadmap.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : (args[i + 1] ?? '');
};

const tasks = readRoadmap();
const byId = new Map(tasks.map((t) => [t.id, t]));

const taskId = option('task');
if (taskId) {
  const task = byId.get(taskId);
  if (!task) {
    console.error(`No task ${taskId} in the roadmap.`);
    process.exit(1);
  }
  const blocking = task.needs.filter((n) => !byId.get(n)?.done);
  console.log(`${task.id} ${task.title}`);
  console.log(`Type: ${task.type}${task.size ? ` · size ${task.size}` : ' · not sized yet'}`);
  console.log(`Needs: ${task.needs.length ? task.needs.join(', ') : 'nothing'}`);
  console.log(
    blocking.length ? `BLOCKED by: ${blocking.join(', ')}` : 'Ready: every need is done.',
  );
  console.log(`Docs (relative to docs/product/): ${task.docs.join(', ') || 'none'}`);
  console.log(`Done when: ${task.doneWhen}`);
  console.log(`Status: ${task.done ? 'done' : 'open'} (roadmap line ${task.line})`);
  process.exit(0);
}

let ready = readyTasks(tasks);
const milestone = option('milestone');
const type = option('type');
if (milestone) ready = ready.filter((t) => t.milestone === milestone);
if (type) ready = ready.filter((t) => t.type === type);

if (args.includes('--json')) {
  console.log(JSON.stringify(ready, null, 2));
  process.exit(0);
}

const done = tasks.filter((t) => t.done).length;
console.log(`${done} of ${tasks.length} tasks done. Ready now: ${ready.length}.\n`);
for (const t of ready) {
  const size = t.size ?? '?';
  console.log(`${t.id.padEnd(6)} ${size}  ${t.type.padEnd(10)} ${t.title}`);
}

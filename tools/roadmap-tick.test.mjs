// The roadmap tick: a merged pull request ticks only the task its title starts with, on the
// task's own line. The titles below are real ones that ticked the wrong tasks on 2 and
// 3 November 2026. Run with `node --test tools/*.test.mjs`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseRoadmap, readRoadmap } from './lib/roadmap.mjs';
import { recount, taskIdFromTitle, tickTasks } from './roadmap-tick.mjs';

const FENCE = '```';
const ROADMAP = [
  '# Roadmap',
  '',
  'Each task reads like this:',
  '',
  FENCE,
  '- [ ] **M4.8** Join with a code · app · needs M4.7, M4.1 · [onboarding](onboarding.md#x)',
  '  Done when: a wrong code, a full room and a started room each show their message.',
  FENCE,
  '',
  '| # | Milestone | Done when | Tasks | Status |',
  '| --- | --- | --- | --- | --- |',
  '| [M0](#m0-groundwork) | Groundwork | The name is chosen | 9 | Done |',
  '| [M4](#m4-first-launch) | First launch | Three phones join | 9 | Done |',
  '',
  'Progress: 9 of 9 tasks done.',
  '',
  '## M0 Groundwork',
  '',
  "- [ ] **M0.1** Choose the app's name · decision · S",
  '- [ ] **M0.2** Buy the domain · ops · S · needs M0.1',
  '',
  '## M4 First launch',
  '',
  '- [x] **M4.7** Home · app · S',
  '- [ ] **M4.8** Join with a code: the keypad · app · M · needs M4.7',
  '  Done when: each `join_room` answer shows its message.',
  '- [ ] **M4.18** The domain hookup · ops · M · needs M0.2',
  '- [ ] **M4.80** A task whose id starts like M4.8 · app · S',
  '<!--',
  '- [ ] **M4.9** A task under a comment · app · S',
  '-->',
  '~~~',
  '- [ ] **M4.10** A task in a tilde code block · app · S',
  '~~~',
].join('\n');

const lineOf = (text, start) => text.split('\n').filter((l) => l.startsWith(start));

test('title: a task title ticks its own id', () => {
  assert.equal(taskIdFromTitle('M4.8 Join with a code'), 'M4.8');
  assert.equal(taskIdFromTitle('M4.20 The join sheet confirms before joining'), 'M4.20');
  assert.equal(taskIdFromTitle('M4.80 Something'), 'M4.80');
});

test('title: a Docs title that mentions ids ticks nothing (#86, #87)', () => {
  assert.equal(taskIdFromTitle('Docs: M10.2 and M16.4 need the domain task, M0.1 open'), null);
  assert.equal(taskIdFromTitle('Docs: point slice 6 references at M4.18'), null);
  assert.equal(
    taskIdFromTitle('Docs: slice 4 answers, and M4.6 split with M4.17 for the name screen'),
    null,
  );
});

test('title: Chore, Fix and Bootstrap titles tick nothing', () => {
  assert.equal(taskIdFromTitle('Chore: tick M3.14 on the roadmap'), null);
  assert.equal(taskIdFromTitle('Fix: the roadmap tick reads only the leading id, not M0.1'), null);
  assert.equal(taskIdFromTitle('Bootstrap the repository for M0.10'), null);
  assert.equal(taskIdFromTitle('Draw the first release in the Figma (M0.9)'), null);
  assert.equal(taskIdFromTitle(''), null);
});

test('title: ids later in a task title are not ticked (M3.6)', () => {
  const title =
    'M3.6 Typed API layer: the profile, room and lobby functions. Card, vote and export ' +
    'wrappers come with M5.6, M6.9, M6.11 and M8.6';
  assert.equal(taskIdFromTitle(title), 'M3.6');
});

test('tick: M4.8 ticks its own line, and the format example stays open', () => {
  const { text, ticked, unknown } = tickTasks(ROADMAP, ['M4.8']);
  assert.deepEqual(ticked, ['M4.8']);
  assert.deepEqual(unknown, []);
  assert.deepEqual(lineOf(text, '- [x] **M4.8**'), [
    '- [x] **M4.8** Join with a code: the keypad · app · M · needs M4.7',
  ]);
  assert.deepEqual(lineOf(text, '- [ ] **M4.8**'), [
    '- [ ] **M4.8** Join with a code · app · needs M4.7, M4.1 · [onboarding](onboarding.md#x)',
  ]);
  assert.equal(lineOf(text, '- [x] **M4.80**').length, 0);
});

test('tick: only the named task changes', () => {
  const { text } = tickTasks(ROADMAP, ['M4.8']);
  const changed = text.split('\n').filter((line, i) => line !== ROADMAP.split('\n')[i]);
  assert.equal(changed.length, 1);
});

test('tick: a task already ticked is left as it is', () => {
  const { text, ticked, unknown } = tickTasks(ROADMAP, ['M4.7']);
  assert.equal(text, ROADMAP);
  assert.deepEqual(ticked, []);
  assert.deepEqual(unknown, []);
});

test('tick: a task under a comment or in a code block is unknown and untouched', () => {
  const { text, ticked, unknown } = tickTasks(ROADMAP, ['M4.9', 'M4.10', 'M9.99']);
  assert.equal(text, ROADMAP);
  assert.deepEqual(ticked, []);
  assert.deepEqual(unknown, ['M4.9', 'M4.10', 'M9.99']);
});

test('read: the example, comments and code blocks hold no tasks', () => {
  const ids = parseRoadmap(ROADMAP).map((t) => t.id);
  assert.deepEqual(ids, ['M0.1', 'M0.2', 'M4.7', 'M4.8', 'M4.18', 'M4.80']);
  const m48 = parseRoadmap(ROADMAP).find((t) => t.id === 'M4.8');
  assert.equal(m48.title, 'Join with a code: the keypad');
  assert.equal(m48.doneWhen, 'each `join_room` answer shows its message.');
});

test('recount: the progress line and the statuses count real tasks only', () => {
  const text = recount(tickTasks(ROADMAP, ['M4.8']).text);
  assert.match(text, /^Progress: 2 of 6 tasks done\.$/m);
  assert.match(text, /^\| \[M0\]\(#m0-groundwork\) \| Groundwork \| .+ \| 2 \| Not started \|$/m);
  assert.match(
    text,
    /^\| \[M4\]\(#m4-first-launch\) \| First launch \| .+ \| 4 \| In progress \|$/m,
  );
});

test('the real roadmap: every task id appears once, and the format example is not a task', () => {
  const tasks = readRoadmap();
  const ids = tasks.map((t) => t.id);
  assert.deepEqual(
    ids.filter((id, i) => ids.indexOf(id) !== i),
    [],
  );
  const m48 = tasks.find((t) => t.id === 'M4.8');
  assert.ok(m48.line > 100, `M4.8 is read from line ${m48.line}, not from the example`);
});

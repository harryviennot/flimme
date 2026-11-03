// Reads docs/product/roadmap.md. A task line looks like:
//   - [ ] **M4.8** Join with a code · app · M · needs M4.7, M4.1 · [onboarding](onboarding.md#...)
//     Done when: a wrong code, a full room and a started room each show their message.
// The size (S, M or L) is optional until the planner has sized the task.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ROADMAP = `${ROOT}docs/product/roadmap.md`;

export const TASK = /^- \[( |x)\] \*\*(M\d+\.\d+)\*\* (.+)$/;

/**
 * For each line, whether it is real text: not inside a code block (like the format example
 * at the top of the roadmap) and not inside an HTML comment. Only these lines hold tasks,
 * for the reader and for the tick alike.
 */
export function liveLines(lines) {
  let fence = null; // the backticks or tildes that opened the current code block
  let inComment = false;
  return lines.map((line) => {
    if (!inComment) {
      if (fence) {
        const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)?.[1];
        if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
        return false;
      }
      const open = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
      if (open) {
        fence = open;
        return false;
      }
    }
    const live = !inComment;
    // Follow the comment openings and closings along the line.
    let at = 0;
    for (;;) {
      const next = line.indexOf(inComment ? '-->' : '<!--', at);
      if (next === -1) break;
      at = next + (inComment ? 3 : 4);
      inComment = !inComment;
    }
    return live;
  });
}

export function readRoadmap(path = ROADMAP) {
  return parseRoadmap(readFileSync(path, 'utf8'));
}

export function parseRoadmap(text) {
  const lines = text.split('\n');
  const live = liveLines(lines);
  const tasks = [];
  let milestone = null;
  lines.forEach((line, index) => {
    if (!live[index]) return;
    const heading = line.match(/^## (M\d+) (.+)$/);
    if (heading) milestone = { id: heading[1], title: heading[2] };
    const match = line.match(TASK);
    if (!match) return;
    const [, mark, id, rest] = match;
    const parts = rest.split(' · ');
    const task = {
      id,
      done: mark === 'x',
      title: parts[0],
      type: parts[1] ?? '',
      size: null,
      needs: [],
      docs: [],
      doneWhen: '',
      milestone: milestone?.id ?? id.split('.')[0],
      line: index + 1,
    };
    for (const part of parts.slice(2)) {
      if (/^(S|M|L)$/.test(part)) task.size = part;
      else if (part.startsWith('needs ')) task.needs = part.slice(6).split(/,\s*/);
      else task.docs.push(...[...part.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1]));
    }
    const next = lines[index + 1] ?? '';
    const doneWhen = next.match(/^\s+Done when: (.+)$/);
    if (doneWhen) task.doneWhen = doneWhen[1];
    tasks.push(task);
  });
  return tasks;
}

/** Open tasks whose needs are all done. */
export function readyTasks(tasks) {
  const done = new Set(tasks.filter((t) => t.done).map((t) => t.id));
  return tasks.filter((t) => !t.done && t.needs.every((n) => done.has(n)));
}

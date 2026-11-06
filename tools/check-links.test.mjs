import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { markdownFiles } from './check-links.mjs';

test("the link check reads the repo's docs and skills, never other agents' worktrees", () => {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  const file = (path) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), '# A\n');
  };
  file('docs/a.md');
  file('.claude/skills/task/SKILL.md');
  file('.claude/worktrees/agent-1/docs/a.md');
  file('node_modules/pkg/README.md');

  const found = markdownFiles(root, root)
    .map((path) => relative(root, path))
    .sort();
  assert.deepEqual(found, ['.claude/skills/task/SKILL.md', 'docs/a.md']);
});

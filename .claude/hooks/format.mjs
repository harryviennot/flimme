#!/usr/bin/env node
// PostToolUse (Edit, Write): formats the file that was just changed, so agents never
// spend a turn on formatting. Failures are ignored: the checks catch real problems.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const file = input.tool_input?.file_path;
if (!file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const path = relative(root, file);
if (path.startsWith('..')) process.exit(0);

const quiet = { cwd: root, stdio: 'ignore', timeout: 30_000 };
if (/\.(ts|tsx|js|mjs|cjs|json|css|ya?ml)$/.test(path) && !path.startsWith('docs/')) {
  spawnSync(
    'pnpm',
    ['exec', 'prettier', '--write', '--log-level', 'silent', '--ignore-unknown', file],
    quiet,
  );
} else if (/^server\/.+\.py$/.test(path)) {
  spawnSync('uv', ['run', '--directory', 'server', 'ruff', 'format', '--quiet', file], quiet);
}
process.exit(0);

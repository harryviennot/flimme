#!/usr/bin/env node
// Lint, type-check and test the packages this branch changed. The same script runs from
// the Stop hook, the pre-push hook and by hand, so "it passed locally" means one thing.
//   node tools/check.mjs              packages changed since main, plus uncommitted work
//   node tools/check.mjs --all        every package
//   node tools/check.mjs --tests-only skip lint and types
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { ROOT } from './lib/roadmap.mjs';

const args = new Set(process.argv.slice(2));
const all = args.has('--all');
const testsOnly = args.has('--tests-only');

const sh = (cmd) =>
  execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
const lines = (s) => s.split('\n').filter(Boolean);

function changedFiles() {
  let base = null;
  for (const ref of ['origin/main', 'main']) {
    try {
      base = sh(`git merge-base HEAD ${ref}`).trim();
      break;
    } catch {
      // try the next ref
    }
  }
  const files = new Set();
  if (base) lines(sh(`git diff --name-only ${base}`)).forEach((f) => files.add(f));
  lines(sh('git diff --name-only HEAD')).forEach((f) => files.add(f));
  lines(sh('git ls-files --others --exclude-standard')).forEach((f) => files.add(f));
  return [...files];
}

const files = all ? [] : changedFiles();
const touched = (...prefixes) => all || files.some((f) => prefixes.some((p) => f.startsWith(p)));

const steps = [];
const add = (name, cmd, cwd = ROOT) => steps.push({ name, cmd, cwd });

if (touched('mobile/', 'packages/contract/', 'pnpm-lock.yaml')) {
  if (testsOnly) add('mobile: tests', 'pnpm --filter mobile exec jest --ci');
  else
    add(
      'mobile: tokens, translations, gallery, lint, types, tests',
      'pnpm --filter mobile run check',
    );
}
if (touched('packages/contract/') && !testsOnly) {
  add('contract: types', 'pnpm --filter @flimme/contract run typecheck');
}
if (touched('server/')) {
  if (has('uv')) {
    if (!testsOnly) {
      add('server: ruff', 'uv run ruff check . && uv run ruff format --check .', `${ROOT}server`);
      add('server: pyright', 'uv run pyright', `${ROOT}server`);
    }
    add('server: pytest', 'uv run pytest -q', `${ROOT}server`);
  } else {
    console.warn('server: skipped, uv is not installed');
  }
}
if (touched('supabase/')) {
  const stackUp =
    has('supabase') &&
    spawnSync('supabase', ['status'], { cwd: ROOT, stdio: 'ignore' }).status === 0;
  if (stackUp) add('database: pgTAP (local Supabase)', 'supabase test db');
  else if (has('psql') && existsSync(`${ROOT}supabase/lite/load.sh`)) {
    add(
      'database: pgTAP (lite Postgres)',
      'bash supabase/lite/load.sh && bash supabase/lite/test.sh',
    );
  } else
    console.warn(
      'database: skipped, neither the local Supabase stack nor the lite Postgres is available',
    );
}
if (
  touched('docs/', 'README.md', 'CLAUDE.md', '.claude/') ||
  files.some((f) => f.endsWith('.md'))
) {
  add('docs: links', 'node tools/check-links.mjs');
}

if (!steps.length) {
  console.log('Nothing to check: no code changed.');
  process.exit(0);
}

let failed = 0;
for (const step of steps) {
  const started = Date.now();
  const run = spawnSync('sh', ['-c', step.cmd], {
    cwd: step.cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (run.status === 0) {
    console.log(`ok    ${step.name} (${seconds} s)`);
  } else {
    failed++;
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n');
    console.log(`FAIL  ${step.name} (${seconds} s)\n${output.slice(-60).join('\n')}\n`);
  }
}
process.exit(failed ? 1 : 0);

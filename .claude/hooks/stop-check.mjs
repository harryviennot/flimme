#!/usr/bin/env node
// Stop: before an agent finishes with unpushed work, run the same checks as the pre-push
// hook and CI (tools/check.mjs). Red means the agent carries on fixing (exit 2, the
// output goes back to it), at most three times in a row. Green work isn't re-checked.
// Set CLAUDE_SKIP_STOP_CHECK=1 to turn it off for a session.
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (process.env.CLAUDE_SKIP_STOP_CHECK === '1') process.exit(0);

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
};

const CODE = /^(mobile|server|supabase|packages|tools)\//;
const uncommitted = git('status --porcelain')
  .split('\n')
  .map((l) => l.slice(3).trim())
  .filter((p) => CODE.test(p));
const upstream = git('rev-parse --abbrev-ref --symbolic-full-name @{u}').trim();
const unpushed = git(`log --format=%H ${upstream || 'origin/main'}..HEAD`).trim();
if (!uncommitted.length && !unpushed) process.exit(0);

const stateDir = `${root}/.claude/state`;
mkdirSync(stateDir, { recursive: true });
const fingerprint = createHash('sha256')
  .update(git('rev-parse HEAD') + git('diff HEAD') + git('status --porcelain'))
  .digest('hex');
const passedFile = `${stateDir}/last-passing-check`;
if (existsSync(passedFile) && readFileSync(passedFile, 'utf8') === fingerprint) process.exit(0);

const run = spawnSync('node', ['tools/check.mjs'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 540_000,
});
const attemptsFile = `${stateDir}/stop-attempts-${input.session_id ?? 'session'}`;

if (run.status === 0) {
  writeFileSync(passedFile, fingerprint);
  writeFileSync(attemptsFile, '0');
  process.exit(0);
}

const attempts = Number(existsSync(attemptsFile) ? readFileSync(attemptsFile, 'utf8') : '0') + 1;
writeFileSync(attemptsFile, String(attempts));
if (attempts > 3) process.exit(0);

console.error(
  `The checks failed (attempt ${attempts} of 3). Fix them before finishing; never skip or delete a test.\n\n` +
    `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n').slice(-80).join('\n'),
);
process.exit(2);

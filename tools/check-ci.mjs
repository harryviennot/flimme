#!/usr/bin/env node
// Two checks for the backend CI (roadmap M1.15), kept as plain functions so
// tools/check-ci.test.mjs can show them failing on a bad example and passing on a good one.
//   node tools/check-ci.mjs pins              every `uses:` is a full commit SHA with a version comment
//   node tools/check-ci.mjs migration-order [BASE]
//                                             new migrations sort after every migration on BASE (default origin/main)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = /^[0-9a-f]{40}$/;
const VERSION_COMMENT = /#\s*v\d+(\.\d+)*\b/;

/** Problems in one workflow's text: an action not pinned to a commit SHA, a pin with no
 * `# vX.Y.Z` comment (Dependabot reads it), or no top-level `permissions:`. */
export function checkWorkflow(name, text) {
  const problems = [];
  if (!/^permissions:/m.test(text)) {
    problems.push(`${name}: no top-level "permissions:" (set contents: read, widen per job)`);
  }
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(?:-\s+)?uses:\s*([^\s#]+)\s*(#.*)?$/);
    if (!m) return;
    const [, ref, comment = ''] = m;
    if (ref.startsWith('./')) return; // a local action lives in this repository
    const at = `${name}:${i + 1}`;
    const sha = ref.includes('@') ? ref.slice(ref.lastIndexOf('@') + 1) : '';
    if (!SHA.test(sha)) problems.push(`${at}: "${ref}" is not pinned to a full commit SHA`);
    else if (!VERSION_COMMENT.test(comment)) {
      problems.push(`${at}: "${ref}" needs a "# vX.Y.Z" comment after the SHA`);
    }
  });
  return problems;
}

const fileName = (path) => path.replace(/^.*\//, '');
const stamp = (path) => fileName(path).split('_')[0];

/** A pull request's new migrations must sort after every migration on the base branch:
 * `supabase db push` refuses a local migration older than one already applied remotely. */
export function checkMigrationOrder(baseFiles, newFiles) {
  const sql = (files) => files.filter((f) => f.endsWith('.sql')).map(fileName);
  const base = sql(baseFiles).sort();
  const latest = base.length ? stamp(base[base.length - 1]) : '';
  const added = sql(newFiles).sort();
  const problems = [];
  for (const file of added) {
    if (!/^\d{14}_/.test(file)) {
      problems.push(`${file}: a migration name starts with a 14-digit timestamp`);
    } else if (stamp(file) <= latest) {
      problems.push(
        `${file}: sorts before or with the latest migration on main (${base[base.length - 1]}). ` +
          'Rename it with "git mv" to a fresh timestamp (supabase migration new).',
      );
    }
  }
  const stamps = added.map(stamp);
  if (new Set(stamps).size !== stamps.length)
    problems.push('Two new migrations share a timestamp.');
  return problems;
}

function runPins() {
  const dir = join(ROOT, '.github', 'workflows');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  const problems = files.flatMap((f) =>
    checkWorkflow(`.github/workflows/${f}`, readFileSync(join(dir, f), 'utf8')),
  );
  return { problems, summary: `${files.length} workflows` };
}

function runMigrationOrder(base) {
  const lines = (...args) =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const onBase = lines('ls-tree', '--name-only', '-r', base, '--', 'supabase/migrations');
  const added = lines(
    'diff',
    '--name-only',
    '--diff-filter=A',
    `${base}...HEAD`,
    '--',
    'supabase/migrations',
  );
  return {
    problems: checkMigrationOrder(onBase, added),
    summary: `${added.length} new against ${onBase.length} on ${base}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, base = 'origin/main'] = process.argv.slice(2);
  const run = { pins: runPins, 'migration-order': () => runMigrationOrder(base) }[cmd];
  if (!run) {
    console.error('Usage: check-ci.mjs pins | migration-order [base]');
    process.exit(2);
  }
  const { problems, summary } = run();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`ok ${cmd} (${summary})`);
}

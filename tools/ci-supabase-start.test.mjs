// tools/ci-supabase-start.sh: CI starts the local stack up to three times, and stops it before
// each retry so a half-started stack can't hold the database port (operations.md#continuous-integration).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ci-supabase-start.sh');

// A fake `supabase` on PATH: it logs every call, and its first `fails` starts fail.
function run(fails, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'supabase-start-'));
  try {
    const log = join(dir, 'calls.log');
    const fake = join(dir, 'supabase');
    writeFileSync(
      fake,
      [
        '#!/usr/bin/env bash',
        'echo "$*" >> "$FAKE_LOG"',
        'if [ "$1" = start ]; then',
        '  n=$(( $(cat "$FAKE_COUNT" 2>/dev/null || echo 0) + 1 ))',
        '  echo "$n" > "$FAKE_COUNT"',
        '  [ "$n" -gt "$FAKE_FAILS" ]',
        'fi',
        '',
      ].join('\n'),
    );
    chmodSync(fake, 0o755);
    const r = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CI_SUPABASE_START_WAIT: '0',
        FAKE_LOG: log,
        FAKE_COUNT: join(dir, 'count'),
        FAKE_FAILS: String(fails),
      },
    });
    let calls = [];
    try {
      calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    } catch {
      // no calls at all
    }
    return { ...r, calls };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

test('supabase start: a first try that works starts once, with the arguments passed through', () => {
  const r = run(0, '-x', 'studio,imgproxy');
  assert.equal(r.status, 0);
  assert.deepEqual(r.calls, ['start -x studio,imgproxy']);
});

test('supabase start: a failed try stops the stack before trying again', () => {
  const r = run(1, '-x', 'studio');
  assert.equal(r.status, 0);
  assert.deepEqual(r.calls, ['start -x studio', 'stop --no-backup', 'start -x studio']);
  assert.match(r.stdout, /try 1 of 3/);
});

test('supabase start: two failed tries, then the third works', () => {
  const r = run(2);
  assert.equal(r.status, 0);
  assert.deepEqual(r.calls, ['start', 'stop --no-backup', 'start', 'stop --no-backup', 'start']);
});

test('supabase start: three failed tries fail the step', () => {
  const r = run(3);
  assert.notEqual(r.status, 0);
  assert.deepEqual(r.calls, ['start', 'stop --no-backup', 'start', 'stop --no-backup', 'start']);
  assert.match(r.stdout, /failed 3 times/);
});

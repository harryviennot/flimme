// tools/restore-dump.sh: the safety checks that run before it touches any database (roadmap M9.6).
// The restore itself is proven by the local drill (operations.md#backups-and-restore).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'restore-dump.sh');
const run = (...args) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8' });

function dumpFolder() {
  const dir = mkdtempSync(join(tmpdir(), 'dump-'));
  for (const n of ['roles', 'schema', 'data']) writeFileSync(join(dir, `${n}.sql`), '');
  return dir;
}

test('restore: refuses a folder that does not exist', () => {
  const r = run('/nonexistent-dump-folder', 'postgresql://postgres@127.0.0.1:5999/drill');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /dump folder/i);
});

test('restore: refuses a folder without the three dump files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dump-'));
  try {
    const r = run(dir, 'postgresql://postgres@127.0.0.1:5999/drill');
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /roles|schema|data/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

for (const host of [
  'db.abcdefghijklmnop.supabase.co',
  'aws-0-eu-west-1.pooler.supabase.com',
  'DB.ABCDEFGHIJKLMNOP.SUPABASE.CO',
]) {
  test(`restore: refuses ${host} without --i-mean-it`, () => {
    const dir = dumpFolder();
    try {
      const r = run(dir, `postgresql://postgres:pw@${host}:5432/postgres`);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /--i-mean-it/);
      assert.ok(!r.stderr.includes('pw@'), 'the password is never printed');
      assert.ok(!r.stdout.includes('pw@'), 'the password is never printed');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
}

test('restore: usage without arguments', () => {
  const r = run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage/i);
});

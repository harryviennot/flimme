// tools/backup-retention.mjs: which backup objects are old enough to delete (roadmap M9.6).
// Run with `node --test tools/*.test.mjs`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RETENTION_DAYS, dumpPrefix, expiredKeys } from './backup-retention.mjs';

const TODAY = new Date('2026-11-29T03:30:00Z');
const files = (date, env = 'production') =>
  ['roles', 'schema', 'data'].map((n) => `${env}/${date}/${n}.sql.age`);

test('retention: kept for 28 days', () => {
  assert.equal(RETENTION_DAYS, 28);
});

test('retention: 27 days old is kept', () => {
  assert.deepEqual(expiredKeys(files('2026-11-02'), TODAY), []);
});

test('retention: exactly 28 days old is kept', () => {
  assert.deepEqual(expiredKeys(files('2026-11-01'), TODAY), []);
});

test('retention: 29 days old is deleted, all three files', () => {
  assert.deepEqual(expiredKeys(files('2026-10-31'), TODAY), files('2026-10-31'));
});

test('retention: only the old dumps go from a mixed list', () => {
  const all = [...files('2026-10-01'), ...files('2026-11-22'), ...files('2026-11-29')];
  assert.deepEqual(expiredKeys(all, TODAY), files('2026-10-01'));
});

test('retention: the other environment and unknown names are never touched', () => {
  const all = [
    ...files('2026-01-01', 'staging'),
    'production/README.txt',
    'production/not-a-date/data.sql.age',
    'production/2026-13-45/data.sql.age',
    'elsewhere/2026-01-01/data.sql.age',
  ];
  assert.deepEqual(expiredKeys(all, TODAY, 'production'), []);
  assert.deepEqual(expiredKeys(all, TODAY, 'staging'), files('2026-01-01', 'staging'));
});

test('retention: a dump from the future is kept', () => {
  assert.deepEqual(expiredKeys(files('2027-01-01'), TODAY), []);
});

test('prefix: environment and UTC date', () => {
  assert.equal(dumpPrefix('staging', TODAY), 'staging/2026-11-29/');
});

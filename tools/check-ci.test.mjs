// Roadmap M1.15, tests 1 and 2: the pin check and the migration-order check, each shown
// failing on a bad example and passing on a good one. Run with `node --test tools/`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkMigrationOrder, checkWorkflow } from './check-ci.mjs';
import { judgeApiAnswers, judgeGraphqlSilent, judgePublicRefused } from './smoke-data-api.mjs';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const wf = (uses) =>
  `name: x\non: push\npermissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - ${uses}\n`;

test('pins: an action on a tag fails', () => {
  const problems = checkWorkflow('ci.yml', wf('uses: actions/checkout@v3'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not pinned to a full commit SHA/);
});

test('pins: a branch or a short SHA fails', () => {
  assert.equal(checkWorkflow('ci.yml', wf('uses: x/y@main')).length, 1);
  assert.equal(checkWorkflow('ci.yml', wf('uses: x/y@3d3c42e # v1.0.0')).length, 1);
});

test('pins: a 40-character SHA with a version comment passes', () => {
  assert.deepEqual(checkWorkflow('ci.yml', wf(`uses: actions/checkout@${SHA} # v7.0.1`)), []);
});

test('pins: a SHA without a version comment fails', () => {
  const problems = checkWorkflow('ci.yml', wf(`uses: actions/checkout@${SHA}`));
  assert.match(problems[0], /# vX\.Y\.Z/);
});

test('pins: a local action needs no pin', () => {
  assert.deepEqual(checkWorkflow('ci.yml', wf('uses: ./.github/actions/x')), []);
});

test('pins: a workflow without top-level permissions fails', () => {
  const text = `name: x\non: push\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${SHA} # v7.0.1\n`;
  assert.match(checkWorkflow('ci.yml', text)[0], /permissions/);
});

const onMain = [
  'supabase/migrations/20261030154334_baseline.sql',
  'supabase/migrations/20261030170000_grant_app_server_queues.sql',
];

test("order: a migration older than main's latest fails", () => {
  const problems = checkMigrationOrder(onMain, ['supabase/migrations/20261030160000_late.sql']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /git mv/);
});

test('order: a migration with the latest timestamp fails', () => {
  const same = ['supabase/migrations/20261030170000_same.sql'];
  assert.equal(checkMigrationOrder(onMain, same).length, 1);
});

test("order: migrations after main's latest pass", () => {
  const added = [
    'supabase/migrations/20261102090000_a.sql',
    'supabase/migrations/20261102091500_b.sql',
  ];
  assert.deepEqual(checkMigrationOrder(onMain, added), []);
});

test('order: no new migration passes', () => {
  assert.deepEqual(checkMigrationOrder(onMain, []), []);
});

test('order: two new migrations with one timestamp fail', () => {
  const added = [
    'supabase/migrations/20261102090000_a.sql',
    'supabase/migrations/20261102090000_b.sql',
  ];
  assert.equal(checkMigrationOrder(onMain, added).length, 1);
});

test('smoke: public refused, graphql silent, api answers', () => {
  assert.equal(judgePublicRefused(406), null);
  assert.match(judgePublicRefused(200), /exposed/);
  assert.equal(judgeGraphqlSilent(404, '{"message":"not found"}'), null);
  assert.equal(judgeGraphqlSilent(500, 'oops'), null);
  assert.match(judgeGraphqlSilent(200, '{"data":{"__typename":"Query"}}'), /pg_graphql is on/);
  assert.equal(judgeApiAnswers(401), null);
  assert.equal(judgeApiAnswers(200), null);
  assert.match(judgeApiAnswers(406), /not exposed/);
});

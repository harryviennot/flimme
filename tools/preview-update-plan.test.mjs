// Roadmap M3.3: which platforms get a preview update, and what the job summary says.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashFrom, jsonFrom, summary, updatePlatform } from './preview-update-plan.mjs';

test('both platforms have a matching build: update all', () => {
  assert.equal(updatePlatform({ ios: true, android: true }), 'all');
});

test('one platform matches: update only that one', () => {
  assert.equal(updatePlatform({ ios: true, android: false }), 'ios');
  assert.equal(updatePlatform({ ios: false, android: true }), 'android');
});

test('the fingerprint changed everywhere: no update', () => {
  assert.equal(updatePlatform({ ios: false, android: false }), 'none');
});

test('the summary asks for a build only for the platforms that need one', () => {
  assert.match(summary({ ios: false, android: false }), /ios and android.*Preview build/s);
  assert.match(summary({ ios: true, android: false }), /changed for android:/);
  assert.doesNotMatch(summary({ ios: true, android: true }), /needed/);
});

test('a fingerprint answer without a hash is an error, never a match for any build', () => {
  assert.equal(hashFrom({ hash: 'abc123' }), 'abc123');
  assert.throws(() => hashFrom({}), /no hash/);
  assert.throws(() => hashFrom({ hash: '' }), /no hash/);
  assert.throws(() => hashFrom(null), /no hash/);
});

// EAS prints which environment variables it loaded before its JSON (seen on staging, 3 Nov 2026).
const loaded =
  'Environment variables with visibility "Plain text" and "Sensitive" loaded from the "preview" environment on EAS: EXPO_PUBLIC_SUPABASE_URL.';

test('reads the JSON that EAS prints after its log lines', () => {
  assert.deepEqual(jsonFrom(`${loaded}\n{\n  "hash": "abc123"\n}\n`), { hash: 'abc123' });
  assert.deepEqual(jsonFrom(`${loaded}\n[{"id":"b1"}]`), [{ id: 'b1' }]);
  assert.deepEqual(jsonFrom('{"hash":"abc123"}'), { hash: 'abc123' });
});

test('output with no JSON in it is an error that shows the output', () => {
  assert.throws(() => jsonFrom(loaded), /did not print JSON: Environment variables/);
  assert.throws(() => jsonFrom(''), /did not print JSON/);
});

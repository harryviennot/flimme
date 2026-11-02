// tools/server-logins.mjs: the hash Postgres stores is right, nothing secret can reach the
// output, and the URL has the pooler's shape. Run with `node --test tools/`.
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  ENVIRONMENTS,
  LOGINS,
  POOLER_HOST,
  connectionUrl,
  redact,
  scramVerifier,
} from './server-logins.mjs';

// RFC 7677, section 3: user "user", password "pencil".
const SALT = 'W22ZaJ0SNY7soEsUEjb6gQ==';
const NONCE = 'rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0';
const AUTH_MESSAGE = `n=user,r=rOprNGfwEbeRWgbNEkqO,r=${NONCE},s=${SALT},i=4096,c=biws,r=${NONCE}`;
const CLIENT_PROOF = 'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=';
const SERVER_SIGNATURE = '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=';

test('scram: the verifier has the form Postgres stores', () => {
  const v = scramVerifier('pencil', Buffer.from(SALT, 'base64'));
  assert.match(v, /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.ok(v.startsWith(`SCRAM-SHA-256$4096:${SALT}$`));
});

test('scram: the server key signs the RFC 7677 exchange', () => {
  const serverKey = scramVerifier('pencil', Buffer.from(SALT, 'base64')).split(':').pop();
  const signature = createHmac('sha256', Buffer.from(serverKey, 'base64'))
    .update(AUTH_MESSAGE)
    .digest('base64');
  assert.equal(signature, SERVER_SIGNATURE);
});

test("scram: the stored key accepts the RFC 7677 client's proof", () => {
  const storedKey = Buffer.from(
    scramVerifier('pencil', Buffer.from(SALT, 'base64')).split('$')[2].split(':')[0],
    'base64',
  );
  const clientSignature = createHmac('sha256', storedKey).update(AUTH_MESSAGE).digest();
  const clientKey = Buffer.from(
    Buffer.from(CLIENT_PROOF, 'base64').map((b, i) => b ^ clientSignature[i]),
  );
  assert.deepEqual(createHash('sha256').update(clientKey).digest(), storedKey);
});

test('scram: a wrong password does not match', () => {
  const right = scramVerifier('pencil', Buffer.from(SALT, 'base64'));
  const wrong = scramVerifier('pencils', Buffer.from(SALT, 'base64'));
  assert.notEqual(right, wrong);
});

test('scram: two runs never share a salt', () => {
  const a = scramVerifier('same').split('$')[1];
  const b = scramVerifier('same').split('$')[1];
  assert.notEqual(a, b);
});

test('url: session pooler, user qualified by the project ref, TLS required', () => {
  const url = connectionUrl({
    login: 'flimme_deck',
    ref: 'abc',
    password: 'p4ss',
    host: 'aws-0-eu-west-1.pooler.supabase.com',
  });
  assert.equal(
    url,
    'postgresql://flimme_deck.abc:p4ss@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require',
  );
});

test('redact: neither a hash nor a URL survives an error message', () => {
  const v = scramVerifier('secret-password');
  const url = connectionUrl({
    login: 'flimme_http',
    ref: 'abc',
    password: 'secret-password',
    host: 'h.pooler.supabase.com',
  });
  const out = redact(
    `ERROR: syntax error at "alter role flimme_http password '${v}'"\nconnection to ${url} failed\npostgres://x:y@z/db`,
  );
  assert.doesNotMatch(out, /secret-password/);
  assert.doesNotMatch(out, /SCRAM-SHA-256\$/);
  assert.match(out, /<hash>/);
  assert.match(out, /<url>/);
});

test('redact: keeps at most four lines and drops the CLI update notice', () => {
  const out = redact('A new version of Supabase CLI is available\n1\n2\n3\n4\n5');
  assert.equal(out, '1\n2\n3\n4');
});

test('host: only a Supabase pooler host is accepted', () => {
  assert.ok(POOLER_HOST.test('aws-0-eu-central-1.pooler.supabase.com'));
  assert.ok(!POOLER_HOST.test('db.abc.supabase.co'));
  assert.ok(!POOLER_HOST.test('evil.com/aws-0.pooler.supabase.com'));
  assert.ok(!POOLER_HOST.test('aws-0-eu-west-1.pooler.supabase.com.evil.com'));
});

test('logins: the HTTP API is alone on the api app, the three workers on the workers app', () => {
  assert.deepEqual(
    LOGINS.filter(([, app]) => app === 'api').map(([l]) => l),
    ['flimme_http'],
  );
  assert.deepEqual(
    LOGINS.filter(([, app]) => app === 'workers').map(([l]) => l),
    ['flimme_pipeline', 'flimme_deck', 'flimme_trainer'],
  );
  for (const env of Object.values(ENVIRONMENTS)) {
    assert.match(env.api, /^flimme-api-(staging|production)$/);
    assert.match(env.workers, /^flimme-workers-(staging|production)$/);
  }
});

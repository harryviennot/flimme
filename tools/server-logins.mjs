#!/usr/bin/env node
// Gives the four server logins new random passwords and stores their connection strings on Fly.io.
// Harry runs it from his own terminal; agents never do (it handles real secrets).
//
//   node tools/server-logins.mjs staging       (or production)
//
// For each of flimme_pipeline, flimme_deck, flimme_trainer and flimme_http:
// 1. generates a password on this machine;
// 2. sends Postgres only its SCRAM-SHA-256 hash (`alter role ... password 'SCRAM-SHA-256$...'`),
//    so the password itself never reaches Supabase's API or its logs;
// 3. connects once through the session pooler, with the server's own psycopg, to prove it works;
// 4. stages the connection string as a Fly secret on the app that runs that process.
// Nothing secret is printed, and the passwords exist nowhere else: run it again to replace them.
// When to run it: once per project after the migrations create the logins, after any restore
// (backups don't keep custom roles' passwords), and to rotate. Then redeploy both apps.
// It needs the Supabase CLI logged in (`supabase login`), flyctl logged in, and `uv sync --directory server`.
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PYTHON = join(ROOT, 'server/.venv/bin/python');

// Project refs and app names are not secret (decisions.md: regions, the Fly.io apps).
export const ENVIRONMENTS = {
  staging: {
    ref: 'mfpkphxjndvtafgeeoeh',
    region: 'Ireland, eu-west-1',
    workers: 'flimme-workers-staging',
    api: 'flimme-api-staging',
  },
  production: {
    ref: 'xmnfmumurximjgsnyiim',
    region: 'Frankfurt, eu-central-1',
    workers: 'flimme-workers-production',
    api: 'flimme-api-production',
  },
};

// The login, the app holding its URL, and the variable the process reads (slice 2, Q3).
export const LOGINS = [
  ['flimme_pipeline', 'workers', 'PIPELINE_DATABASE_URL'],
  ['flimme_deck', 'workers', 'DECK_DATABASE_URL'],
  ['flimme_trainer', 'workers', 'TRAINER_DATABASE_URL'],
  ['flimme_http', 'api', 'API_DATABASE_URL'],
];

export const POOLER_HOST = /^[a-z0-9-]+\.pooler\.supabase\.com$/;

/** The SCRAM-SHA-256 verifier Postgres stores for a password (RFC 5802, RFC 7677). */
export function scramVerifier(password, salt = randomBytes(16), iterations = 4096) {
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  const b64 = (b) => b.toString('base64');
  return `SCRAM-SHA-256$${iterations}:${b64(salt)}$${b64(storedKey)}:${b64(serverKey)}`;
}

/** A session-mode pooler URL: the user is `<login>.<project ref>`, on port 5432. */
export function connectionUrl({ login, ref, password, host }) {
  return `postgresql://${login}.${ref}:${password}@${host}:5432/postgres?sslmode=require`;
}

/** Error text may echo the query or the URL: keep at most four lines, with neither in them. */
export function redact(text) {
  return String(text)
    .replace(/SCRAM-SHA-256\$[^'"\s]+/g, '<hash>')
    .replace(/postgres(ql)?:\/\/\S+/g, '<url>')
    .split('\n')
    .filter((l) => l.trim() && !/new version|recommend/i.test(l))
    .slice(0, 4)
    .join('\n');
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ?? ''}` };
}

async function main(envName) {
  const env = ENVIRONMENTS[envName];
  if (!env) {
    console.error('Usage: node tools/server-logins.mjs staging|production');
    return 1;
  }
  if (!existsSync(PYTHON)) {
    console.error(`No server virtualenv at ${PYTHON}. Run "uv sync --directory server" first.`);
    return 1;
  }

  console.log(`\n${envName}: project ${env.ref} (${env.region})`);
  console.log(
    'Session pooler host: Supabase dashboard, this project, Connect (top bar), "Session pooler".',
  );
  console.log('Copy only the host, for example aws-0-eu-west-1.pooler.supabase.com.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const host = (await rl.question('Host: ')).trim();
  rl.close();
  if (!POOLER_HOST.test(host)) {
    console.error(`That doesn't look like a pooler host: "${host}"`);
    return 1;
  }

  let failed = 0;
  for (const [login, appKind, name] of LOGINS) {
    const app = env[appKind];
    const password = randomBytes(24).toString('hex');
    const url = connectionUrl({ login, ref: env.ref, password, host });

    const alter = run(
      'supabase',
      [
        'db',
        'query',
        '--linked',
        '--project-ref',
        env.ref,
        `alter role ${login} password '${scramVerifier(password)}'`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (!alter.ok) {
      console.error(`✗ ${login}: setting the password failed\n${redact(alter.out)}`);
      if (/access token/i.test(alter.out))
        console.error('  Run "supabase login" once, then try again.');
      failed++;
      continue;
    }

    // The pooler can take a few seconds to see a new password.
    let tested = false;
    let lastError = '';
    for (let attempt = 0; attempt < 4 && !tested; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 5000));
      const t = run(
        PYTHON,
        [
          '-c',
          'import os, psycopg; psycopg.connect(os.environ["FLIMME_TEST_URL"], connect_timeout=10).close()',
        ],
        { env: { ...process.env, FLIMME_TEST_URL: url } },
      );
      tested = t.ok;
      lastError = t.out;
    }
    if (!tested) {
      console.error(
        `✗ ${login}: password set, but connecting through ${host} failed\n${redact(lastError)}`,
      );
      failed++;
      continue;
    }

    // Through stdin, so the URL never appears in a process list.
    const fly = run('fly', ['secrets', 'import', '--stage', '-a', app], {
      input: `${name}=${url}\n`,
    });
    if (!fly.ok) {
      console.error(
        `✗ ${login}: the connection works, but storing it on ${app} failed\n${redact(fly.out)}`,
      );
      failed++;
      continue;
    }
    console.log(`✓ ${login}: tested, stored as ${name} on ${app}`);
  }

  console.log(
    failed
      ? `\n${failed} of ${LOGINS.length} failed: fix the cause and run it again.`
      : `\nAll four done. They apply at the next deploy of ${env.workers} and ${env.api}.`,
  );
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv[2]));
}

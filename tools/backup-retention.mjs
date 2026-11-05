#!/usr/bin/env node
// Which backup objects are old enough to delete (roadmap M9.6, operations.md#backups-and-restore).
// Object names are `<env>/<UTC date>/{roles,schema,data}.sql.age`; a dump is kept 28 days.
//   node tools/backup-retention.mjs <env> [YYYY-MM-DD]   object names on stdin, the expired ones on stdout
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RETENTION_DAYS = 28;
const DAY_MS = 24 * 60 * 60 * 1000;
const KEY = /^([a-z]+)\/(\d{4})-(\d{2})-(\d{2})\/[a-z]+\.sql\.age$/;

const utcDay = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** `<env>/<UTC date>/` for a dump made on `date`. */
export function dumpPrefix(env, date) {
  return `${env}/${date.toISOString().slice(0, 10)}/`;
}

/** The keys of `env` whose date is more than RETENTION_DAYS before `today`. Anything that doesn't
 * look like a dump of this environment is left alone. */
export function expiredKeys(keys, today, env = 'production') {
  const now = utcDay(today);
  return keys.filter((key) => {
    const m = KEY.exec(key);
    if (!m || m[1] !== env) return false;
    const [y, mo, d] = [Number(m[2]), Number(m[3]), Number(m[4])];
    const at = Date.UTC(y, mo - 1, d);
    const real = new Date(at);
    if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d) {
      return false; // not a real date
    }
    return (now - at) / DAY_MS > RETENTION_DAYS;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [env, day] = process.argv.slice(2);
  if (!env) {
    console.error('usage: backup-retention.mjs <env> [YYYY-MM-DD] < object-names');
    process.exit(2);
  }
  const keys = readFileSync(0, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const today = day ? new Date(`${day}T00:00:00Z`) : new Date();
  for (const key of expiredKeys(keys, today, env)) console.log(key);
}

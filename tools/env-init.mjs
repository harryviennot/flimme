#!/usr/bin/env node
// Creates each package's .env.local from its .env.example (never overwriting one), and
// with --lan points the app at this machine's network address, so a phone on the same
// Wi-Fi reaches the local Supabase and server. Fills the local publishable key when the
// stack is running.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

import { ROOT } from './lib/roadmap.mjs';

for (const pkg of ['mobile', 'server']) {
  const example = `${ROOT}${pkg}/.env.example`;
  const local = `${ROOT}${pkg}/.env.local`;
  if (existsSync(example) && !existsSync(local)) {
    copyFileSync(example, local);
    console.log(`Created ${pkg}/.env.local`);
  }
}

const mobileEnv = `${ROOT}mobile/.env.local`;
if (!existsSync(mobileEnv)) process.exit(0);
let env = readFileSync(mobileEnv, 'utf8');

if (process.argv.includes('--lan')) {
  const address = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (address) {
    env = env.replace(
      /^(EXPO_PUBLIC_(?:SUPABASE|SERVER)_URL=http:\/\/)[^:/]+/gm,
      (_, prefix) => `${prefix}${address}`,
    );
    console.log(`The app will reach the local stack at ${address}`);
  }
}

try {
  const status = execSync('supabase status -o env', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const key = status.match(/^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)"?$/m)?.[1];
  if (key)
    env = env.replace(
      /^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=.*$/m,
      `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}`,
    );
} catch {
  // The stack isn't running: keep the placeholder.
}

writeFileSync(mobileEnv, env);

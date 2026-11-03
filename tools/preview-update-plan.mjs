#!/usr/bin/env node
// Decides, on a merge to main, whether the preview channel gets an EAS Update (roadmap M3.3, Q14).
// An update only reaches a build with the same native fingerprint, so for each platform we ask EAS
// whether a finished preview build carries the fingerprint of this commit. If none does, the
// native code changed: no automatic build (the free plan has 15 per platform a month), and the job
// summary tells Harry to start one (the "Preview build" workflow).
//   node tools/preview-update-plan.mjs     (from the repository root; needs `eas` and EXPO_TOKEN)
// Writes `platform=all|ios|android|none` to $GITHUB_OUTPUT and a note to $GITHUB_STEP_SUMMARY.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = ['ios', 'android'];

/** The `--platform` value for `eas update`, given which platforms have a matching preview build. */
export function updatePlatform(matches) {
  const ok = PLATFORMS.filter((p) => matches[p]);
  if (ok.length === PLATFORMS.length) return 'all';
  return ok[0] ?? 'none';
}

/** The job summary, in markdown. */
export function summary(matches) {
  const missing = PLATFORMS.filter((p) => !matches[p]);
  if (missing.length === 0) return 'Preview update published for ios and android.';
  return [
    `The native fingerprint changed for ${missing.join(' and ')}: no preview build carries it, so no update goes out for it.`,
    'A preview build is needed. Start one: Actions, "Preview build", Run workflow. Builds are never automatic (the free plan has 15 per platform a month).',
  ].join('\n\n');
}

/** The fingerprint hash from `eas fingerprint:generate --json`. Without a real hash the build
 * lookup would match any build, and an update could reach a build it doesn't fit. */
export function hashFrom(output) {
  if (typeof output?.hash !== 'string' || output.hash.length === 0) {
    throw new Error(`eas fingerprint:generate gave no hash: ${JSON.stringify(output)}`);
  }
  return output.hash;
}

const MOBILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile');

function eas(args) {
  const out = execFileSync('eas', [...args, '--json', '--non-interactive'], {
    cwd: MOBILE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`eas ${args[0]} did not print JSON: ${out.slice(0, 200)}`);
  }
}

function hasPreviewBuild(platform) {
  // Same environment as the build and the update: the app config counts in the fingerprint.
  const hash = hashFrom(
    eas(['fingerprint:generate', '--platform', platform, '--environment', 'preview']),
  );
  const builds = eas([
    'build:list',
    '--platform',
    platform,
    '--build-profile',
    'preview',
    '--status',
    'finished',
    '--fingerprint-hash',
    hash,
    '--limit',
    '1',
  ]);
  return Array.isArray(builds) && builds.length > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const matches = Object.fromEntries(PLATFORMS.map((p) => [p, hasPreviewBuild(p)]));
  const platform = updatePlatform(matches);
  console.log(JSON.stringify({ matches, platform }));
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `platform=${platform}\n`);
  if (platform !== 'all' && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary(matches)}\n`);
  }
}

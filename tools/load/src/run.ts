// The load runner: plays the load test's scenario with bots and writes a report.
//   pnpm --filter @flimme/load start -- --target staging --rooms4 2 --rooms10 1 --ramp 30s --duration 5m
//   pnpm --filter @flimme/load start -- check --ledger <file> --counts <file>
// See docs/architecture/operations.md#load-test. Staging (or the local stack) only: the URL is
// checked before a single bot signs in. Accounts come from LOAD_ACCOUNTS_FILE (a git-ignored JSON
// list of { email, password }) or LOAD_ACCOUNTS (the same JSON), never from the repo.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { localBackend, stagingBackend, type Backend } from '../../bots/src/config';
import {
  assertAllowedUrl,
  botsIn,
  parseAccounts,
  parseLoadArgs,
  UsageError,
  type Account,
  type LoadConfig,
} from './config';
import { compareCounts, createLedger } from './ledger';
import { createMatchTracker } from './match-tracker';
import { buildReport } from './report';
import { planRooms } from './ramp';
import { playCycle, signInBot, type Recorder, type RunBot } from './room';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function backendFor(config: LoadConfig): Backend {
  const backend =
    config.target === 'staging'
      ? stagingBackend(process.env)
      : localBackend(
          execSync('supabase status -o env', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }),
        );
  assertAllowedUrl(backend.url, config.target);
  return backend;
}

function loadAccounts(config: LoadConfig): Account[] | null {
  const file = process.env.LOAD_ACCOUNTS_FILE;
  const text = file ? readFileSync(file, 'utf8') : process.env.LOAD_ACCOUNTS;
  if (!text) {
    if (config.target === 'staging') {
      throw new UsageError(
        'Staging needs the bot accounts: LOAD_ACCOUNTS_FILE (a git-ignored JSON file) or LOAD_ACCOUNTS',
      );
    }
    return null; // The local stack signs bots in as anonymous guests.
  }
  const accounts = parseAccounts(text);
  const needed = botsIn(config);
  if (accounts.length < needed) {
    throw new UsageError(`${accounts.length} accounts for ${needed} bots: not enough`);
  }
  return accounts;
}

async function runLoad(config: LoadConfig) {
  const backend = backendFor(config);
  const accounts = loadAccounts(config);
  const plan = planRooms(config);
  const bots = botsIn(config);
  // The host of the backend is not personal data: it shows where the bots go.
  console.log(
    `Load run on ${config.target} (${new URL(backend.url).host}): ${config.rooms4} rooms of 4, ${config.rooms10} of 10, ${bots} bots, seed ${config.seed}`,
  );

  const rec: Recorder = {
    castVoteMs: [],
    castVoteErrors: 0,
    startGameMs: [],
    fallbackDeals: 0,
    timeToPickMs: [],
    failures: {},
    rooms: { started: 0, cycles: 0, picks: 0, noPicks: 0, abandoned: 0 },
    tracker: createMatchTracker(),
    ledger: createLedger(),
  };

  const since = new Date().toISOString();
  const startedAt = Date.now();
  const endAt = startedAt + config.durationMs;
  let stopping = false;
  let stopNow: () => void = () => {};
  const stopSignal = new Promise<void>((resolve) => (stopNow = resolve));
  let forceNow: () => void = () => {};
  const forceSignal = new Promise<void>((resolve) => (forceNow = resolve));
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping: no new games; running rooms get a short time to finish.');
    stopNow();
  };
  let signals = 0;
  const onSignal = () => {
    signals += 1;
    // A second Ctrl-C gives up on the grace period, not on the report: rooms still leave.
    if (signals > 1) {
      console.log('Second signal: not waiting for rooms to finish.');
      forceNow();
    }
    stop();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  setTimeout(stop, config.durationMs + 1).unref();

  let accountIndex = 0;
  let botIndex = 0;
  let activeSlots = 0;

  const slot = async (size: number, startAtMs: number) => {
    await Promise.race([sleep(startAtMs), stopSignal]);
    if (stopping) return;
    activeSlots += 1;
    const members: RunBot[] = [];
    try {
      for (let i = 0; i < size; i += 1) {
        botIndex += 1;
        const account = accounts ? accounts[accountIndex++]! : null;
        if (stopping) return;
        members.push(await signInBot(botIndex, backend, account));
        await sleep(250);
      }
      let failures = 0;
      while (!stopping && Date.now() < endAt && failures < 5) {
        const end = await playCycle({
          bots: members,
          rec,
          seed: config.seed + botIndex,
          swipeMs: config.swipeMs,
          likeRate: config.likeRate,
          stopping: stopSignal,
          force: forceSignal,
          graceMs: config.graceMs,
          cycleTimeoutMs: config.cycleTimeoutMs,
        });
        failures = end === 'failed' ? failures + 1 : 0;
        await sleep(end === 'failed' ? 5000 : 1000);
      }
    } catch (error) {
      console.error(`A room stopped: ${(error as Error).message}`);
    } finally {
      for (const bot of members) await bot.client.auth.signOut().catch(() => {});
      activeSlots -= 1;
    }
  };

  const progress = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `${elapsed}s: ${activeSlots} rooms active, ${rec.rooms.cycles} games started, ${rec.rooms.picks} picks, ${rec.castVoteMs.length} votes`,
    );
  }, 30_000);
  await Promise.all(plan.map((room) => slot(room.size, room.startAtMs)));
  clearInterval(progress);

  const date = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().slice(11, 19).replaceAll(':', '');
  const reportPath = join(config.outDir, `load-report-${date}-${stamp}.md`);
  const ledgerPath = join(config.outDir, `load-ledger-${date}-${stamp}.json`);
  const text = buildReport({
    date,
    scenario: {
      rooms4: config.rooms4,
      rooms10: config.rooms10,
      rampMs: config.rampMs,
      durationMs: config.durationMs,
      bots,
      swipeMs: config.swipeMs,
      likeRate: config.likeRate,
      target: config.target,
    },
    ramp: `${plan.length} rooms started evenly`,
    rooms: { ...rec.rooms, timeToPickMs: rec.timeToPickMs },
    failures: rec.failures,
    measures: {
      castVoteMs: rec.castVoteMs,
      matchMs: rec.tracker.samples(),
      fallbackDeals: rec.fallbackDeals,
      deals: rec.startGameMs.length,
      lost: null,
      duplicated: null,
      castVoteErrors: rec.castVoteErrors,
    },
    startGameMs: rec.startGameMs,
    since,
  });
  writeFileSync(reportPath, text);
  writeFileSync(
    ledgerPath,
    JSON.stringify({
      since,
      expected: rec.ledger.expected(),
      answeredTwice: rec.ledger.answeredTwiceTotal(),
    }),
  );
  console.log(`Report: ${reportPath}`);
  console.log(`Vote ledger (seat ids inside, keep it private): ${ledgerPath}`);
  console.log(text);
  // The bots' Realtime sockets keep the process alive otherwise.
  process.exit(0);
}

/** `check`: the ledger against the rows of `votes` counted per seat. */
function runCheck(argv: string[]) {
  const get = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    const value = at >= 0 ? argv[at + 1] : undefined;
    if (!value) throw new UsageError(`check needs --${name} <file>`);
    return value;
  };
  const ledger = JSON.parse(readFileSync(get('ledger'), 'utf8')) as {
    expected: Record<string, number>;
    answeredTwice?: number;
  };
  const counts = JSON.parse(readFileSync(get('counts'), 'utf8')) as Record<string, number>;
  const result = compareCounts(ledger.expected, counts);
  result.duplicated += ledger.answeredTwice ?? 0;
  const verdict = result.lost === 0 && result.duplicated === 0 ? 'PASS' : 'FAIL';
  console.log(
    `Votes over ${result.seats} seats: ${result.lost} lost, ${result.duplicated} duplicated: ${verdict}`,
  );
  process.exit(verdict === 'PASS' ? 0 : 1);
}

async function main() {
  const argv = process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--'));
  if (argv[0] === 'check') return runCheck(argv.slice(1));
  await runLoad(parseLoadArgs(argv));
}

main().catch((error) => {
  console.error(
    error instanceof UsageError ? `Usage: ${error.message}` : String(error.message ?? error),
  );
  process.exit(error instanceof UsageError ? 2 : 1);
});

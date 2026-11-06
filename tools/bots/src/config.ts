// Reads the command line and the environment. Pure, so it is tested without a network.
//   mise run bots -- --code 482913 --count 3
//   mise run bots -- --code 482913 --swipe-ms 1500 --like-rate 0.4
//   mise run bots -- --code 482913 --seed 7 --personality picky
// Bots swipe at their own pace by default (`--swipe-ms off` keeps them present only).
// Targets: `local` (the default) reads `supabase status -o env`; `staging` reads
// FLIMME_STAGING_URL and FLIMME_STAGING_KEY from the environment (the publishable key,
// never committed). Never point it at production.

import { PERSONALITY_MODES, type PersonalityMode } from './personality';

export type Target = 'local' | 'staging';

export type BotConfig = {
  /** `play-again` (M6.23): bots that follow `next_room`, or a bot host that plays and then calls Play again. */
  action: 'play' | 'play-again';
  /** With `play-again`: `host` makes the first bot create the room, `guest` joins `code`. */
  as: 'host' | 'guest';
  code: string;
  count: number;
  target: Target;
  /** Milliseconds between swipes: a number sets the base pace, null (`auto`) uses each bot's own, 'off' only stays present. */
  swipeMs: number | null | 'off';
  /** Share of swipes that are a like, from 0 to 1; null lets each bot's personality decide. */
  likeRate: number | null;
  /** Makes a game reproducible: personalities, tastes and choices follow from it. */
  seed: number;
  personality: PersonalityMode;
  /** TMDB genre ids each bot picks in the lobby (M6.54); empty picks none. */
  genres: number[];
  /** Leave the room when stopped, so the seat does not stay in the counts. */
  leaveOnStop: boolean;
};

export const HEARTBEAT_MS = 30_000;

export class UsageError extends Error {}

export function parseArgs(input: string[]): BotConfig {
  const action = input[0] === 'play-again' ? 'play-again' : 'play';
  const argv = action === 'play-again' ? input.slice(1) : input;
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (!arg.startsWith('--')) throw new UsageError(`Unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
    flags.set(arg.slice(2), value);
    i += 1;
  }
  const known = [
    'code',
    'count',
    'target',
    'swipe-ms',
    'like-rate',
    'seed',
    'personality',
    'as',
    'genres',
    'leave-on-stop',
  ];
  for (const key of flags.keys())
    if (!known.includes(key)) throw new UsageError(`Unknown option --${key}`);

  const as = flags.get('as') ?? 'guest';
  if (as !== 'host' && as !== 'guest') throw new UsageError('--as must be host or guest');
  if (as === 'host' && action !== 'play-again') {
    throw new UsageError('--as host belongs to the play-again action');
  }
  // A bot host opens its own room: the code is printed, not given.
  const code = as === 'host' ? (flags.get('code') ?? 'HOSTED') : flags.get('code');
  if (!code || !/^[A-Za-z0-9]{4,8}$/.test(code)) {
    throw new UsageError('--code is required: the room code, 4 to 8 letters or digits');
  }
  const count = Number(flags.get('count') ?? 3);
  if (!Number.isInteger(count) || count < 1 || count > 9) {
    throw new UsageError('--count must be a whole number from 1 to 9');
  }
  const target = flags.get('target') ?? 'local';
  if (target !== 'local' && target !== 'staging') {
    throw new UsageError('--target must be local or staging');
  }
  const swipe = flags.get('swipe-ms');
  let swipeMs: number | null | 'off' = null;
  if (swipe === 'off') swipeMs = 'off';
  else if (swipe !== undefined && swipe !== 'auto') {
    swipeMs = Number(swipe);
    if (!Number.isFinite(swipeMs) || swipeMs < 200) {
      throw new UsageError('--swipe-ms must be a number of at least 200, auto or off');
    }
  }
  const rate = flags.get('like-rate');
  const likeRate = rate === undefined ? null : Number(rate);
  if (likeRate !== null && !(likeRate >= 0 && likeRate <= 1)) {
    throw new UsageError('--like-rate must be from 0 to 1');
  }
  const seedText = flags.get('seed');
  const seed = seedText === undefined ? Math.floor(Math.random() * 2 ** 31) : Number(seedText);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new UsageError('--seed must be a whole number, 0 or more');
  }
  const personality = flags.get('personality') ?? 'mixed';
  if (!PERSONALITY_MODES.includes(personality as PersonalityMode)) {
    throw new UsageError('--personality must be mixed, agreeable or picky');
  }
  const genreText = flags.get('genres');
  const genres = genreText === undefined ? [] : genreText.split(',').map(Number);
  if (genres.length > 3 || genres.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new UsageError('--genres is up to 3 TMDB genre ids, like 35,27');
  }
  const leave = flags.get('leave-on-stop') ?? 'no';
  if (leave !== 'yes' && leave !== 'no') throw new UsageError('--leave-on-stop must be yes or no');
  return {
    action,
    as,
    code: code.toUpperCase(),
    count,
    target,
    swipeMs,
    likeRate,
    seed,
    personality: personality as PersonalityMode,
    genres,
    leaveOnStop: leave === 'yes',
  };
}

export type Backend = { url: string; key: string };

/** `supabase status -o env` prints KEY="value" lines. */
export function parseStatusEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) out[match[1]!] = match[2]!;
  }
  return out;
}

export function localBackend(statusEnv: string): Backend {
  const env = parseStatusEnv(statusEnv);
  const url = env.API_URL;
  const key = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
  if (!url || !key) throw new UsageError('The local stack is not running: try `supabase start`');
  return { url, key };
}

export function stagingBackend(env: Record<string, string | undefined>): Backend {
  const url = env.FLIMME_STAGING_URL;
  const key = env.FLIMME_STAGING_KEY;
  if (!url || !key) {
    throw new UsageError(
      'Staging needs FLIMME_STAGING_URL and FLIMME_STAGING_KEY (the publishable key) in the environment',
    );
  }
  return { url, key };
}

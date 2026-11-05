// The command line, the guard on where the bots may go, and the accounts file. Pure, so it is
// tested without a network. Nothing here prints an email, a password or a URL it refused.
//
//   pnpm --filter @flimme/load start -- --target staging --rooms4 3 --rooms10 1 --ramp 30s --duration 5m
//   pnpm --filter @flimme/load start -- --target staging --full        (the whole scenario, M9.9)

export class UsageError extends Error {}

export type LoadTarget = 'local' | 'staging';

/** Staging's project ref (docs/architecture/operations.md#environments). The runner goes nowhere else. */
export const STAGING_REF = 'mfpkphxjndvtafgeeoeh';
/** More bots than this needs `--full`: a typo must not hit the real scenario. */
export const SMALL_RUN_MAX_BOTS = 20;

export type LoadConfig = {
  rooms4: number;
  rooms10: number;
  rampMs: number;
  durationMs: number;
  /** How long running rooms get to finish after the end or Ctrl-C before the bots leave. */
  graceMs: number;
  full: boolean;
  target: LoadTarget;
  /** Base milliseconds per card (personalities scale it: fast 0.5, medium 1, slow 2). */
  swipeMs: number;
  likeRate: number;
  seed: number;
  /** Where the report and the vote ledger go. */
  outDir: string;
  /** Give up on a room that has not reached a pick after this long. */
  cycleTimeoutMs: number;
};

export function parseDuration(text: string): number {
  const match = /^(\d+)(s|m|h)$/.exec(text);
  if (!match) throw new UsageError(`Not a duration: ${text} (use 30s, 5m or 1h)`);
  const unit = { s: 1000, m: 60_000, h: 3_600_000 }[match[2] as 's' | 'm' | 'h'];
  return Number(match[1]) * unit;
}

const KNOWN = [
  'rooms4',
  'rooms10',
  'ramp',
  'duration',
  'grace',
  'target',
  'swipe-ms',
  'like-rate',
  'seed',
  'out',
  'cycle-timeout',
];

export function parseLoadArgs(argv: string[]): LoadConfig {
  const flags = new Map<string, string>();
  let full = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--full') {
      full = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new UsageError(`Unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
    flags.set(arg.slice(2), value);
    i += 1;
  }
  for (const key of flags.keys())
    if (!KNOWN.includes(key)) throw new UsageError(`Unknown option --${key}`);

  const count = (name: string, fallback: number) => {
    const text = flags.get(name);
    const n = text === undefined ? fallback : Number(text);
    if (!Number.isInteger(n) || n < 0)
      throw new UsageError(`--${name} must be a whole number, 0 or more`);
    return n;
  };
  const rooms4 = count('rooms4', 45);
  const rooms10 = count('rooms10', 5);
  if (rooms4 + rooms10 === 0)
    throw new UsageError('Nothing to play: --rooms4 and --rooms10 are both 0');
  const bots = rooms4 * 4 + rooms10 * 10;
  if (bots > SMALL_RUN_MAX_BOTS && !full) {
    throw new UsageError(
      `${bots} bots is more than ${SMALL_RUN_MAX_BOTS}: pass --full to run the whole scenario on purpose`,
    );
  }

  const target = flags.get('target') ?? 'local';
  if (target !== 'local' && target !== 'staging')
    throw new UsageError('--target must be local or staging');
  const likeRate = Number(flags.get('like-rate') ?? 0.3);
  if (!(likeRate >= 0 && likeRate <= 1)) throw new UsageError('--like-rate must be from 0 to 1');
  const swipeMs = Number(flags.get('swipe-ms') ?? 3000);
  if (!Number.isFinite(swipeMs) || swipeMs < 200)
    throw new UsageError('--swipe-ms must be at least 200');
  const seedText = flags.get('seed');
  const seed = seedText === undefined ? Math.floor(Math.random() * 2 ** 31) : Number(seedText);
  if (!Number.isInteger(seed) || seed < 0)
    throw new UsageError('--seed must be a whole number, 0 or more');

  return {
    rooms4,
    rooms10,
    rampMs: parseDuration(flags.get('ramp') ?? '5m'),
    durationMs: parseDuration(flags.get('duration') ?? '30m'),
    graceMs: parseDuration(flags.get('grace') ?? '60s'),
    full,
    target,
    swipeMs,
    likeRate,
    seed,
    outDir: flags.get('out') ?? '.',
    cycleTimeoutMs: parseDuration(flags.get('cycle-timeout') ?? '10m'),
  };
}

export const botsIn = (config: Pick<LoadConfig, 'rooms4' | 'rooms10'>) =>
  config.rooms4 * 4 + config.rooms10 * 10;

/** Staging's API host for the staging target, the local stack for local; production never. */
export function assertAllowedUrl(url: string, target: LoadTarget): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new UsageError('The Supabase URL is not a URL');
  }
  const ok =
    target === 'staging'
      ? host === `${STAGING_REF}.supabase.co`
      : host === '127.0.0.1' || host === 'localhost';
  if (!ok) {
    throw new UsageError(
      target === 'staging'
        ? 'Refused: the Supabase URL is not staging. The load runner never goes anywhere else.'
        : 'Refused: --target local only goes to the local stack on this machine.',
    );
  }
}

export type Account = { email: string; password: string };

/** A JSON list of `{ email, password }`. Errors never repeat the content. */
export function parseAccounts(text: string): Account[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UsageError('The accounts are not valid JSON (a list of { email, password })');
  }
  const ok =
    Array.isArray(data) &&
    data.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as Account).email === 'string' &&
        typeof (item as Account).password === 'string',
    );
  if (!ok) throw new UsageError('The accounts must be a list of { email, password }');
  return (data as Account[]).map(({ email, password }) => ({ email, password }));
}

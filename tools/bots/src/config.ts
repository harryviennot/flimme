// Reads the command line and the environment. Pure, so it is tested without a network.
//   mise run bots -- --code 482913 --count 3
//   mise run bots -- --code 482913 --swipe-ms 1500 --like-rate 0.4
// Targets: `local` (the default) reads `supabase status -o env`; `staging` reads
// FLIMME_STAGING_URL and FLIMME_STAGING_KEY from the environment (the publishable key,
// never committed). Never point it at production.

export type Target = 'local' | 'staging';

export type BotConfig = {
  code: string;
  count: number;
  target: Target;
  /** Milliseconds between swipes once the game runs; null means the bots only stay present. */
  swipeMs: number | null;
  /** Share of swipes that are a like, from 0 to 1. */
  likeRate: number;
};

export const HEARTBEAT_MS = 30_000;

export class UsageError extends Error {}

export function parseArgs(argv: string[]): BotConfig {
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
  const known = ['code', 'count', 'target', 'swipe-ms', 'like-rate'];
  for (const key of flags.keys())
    if (!known.includes(key)) throw new UsageError(`Unknown option --${key}`);

  const code = flags.get('code');
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
  const swipeMs = swipe === undefined ? null : Number(swipe);
  if (swipeMs !== null && (!Number.isFinite(swipeMs) || swipeMs < 200)) {
    throw new UsageError('--swipe-ms must be a number of at least 200');
  }
  const likeRate = Number(flags.get('like-rate') ?? 0.5);
  if (!(likeRate >= 0 && likeRate <= 1)) throw new UsageError('--like-rate must be from 0 to 1');
  return { code: code.toUpperCase(), count, target, swipeMs, likeRate };
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

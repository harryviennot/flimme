// One room's life in the load test: a host creates it, the others join by code, everyone is
// present and swipes like the app (attachSeat from the bots), the host starts the game, and the
// room plays to a pick. Every call that matters is measured here. Rule 7: nothing in this file
// logs a code, a seat id, an account or a title.
import { performance } from 'node:perf_hooks';

import { AVATAR_KEYS, createApi } from '@flimme/contract';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { attachSeat } from '../../bots/src/bot';
import type { Backend } from '../../bots/src/config';
import { makePersonality, seededRandom } from '../../bots/src/personality';
import type { Account } from './config';
import type { Ledger } from './ledger';
import { createMatchTracker } from './match-tracker';

type Api = ReturnType<typeof createApi>;

/** Everything the run measures, shared by all rooms. */
export type Recorder = {
  castVoteMs: number[];
  castVoteErrors: number;
  startGameMs: number[];
  fallbackDeals: number;
  timeToPickMs: number[];
  /** Why a game could not be played, by step and answer (`start:too_few_films`). */
  failures: Record<string, number>;
  rooms: { started: number; cycles: number; picks: number; noPicks: number; abandoned: number };
  tracker: ReturnType<typeof createMatchTracker>;
  ledger: Ledger;
};

export type RunBot = { index: number; client: SupabaseClient; api: Api };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Signs a bot in (an email account, or an anonymous guest on the local stack) and sets its profile. */
export async function signInBot(
  index: number,
  backend: Backend,
  account: Account | null,
): Promise<RunBot> {
  const client = createClient(backend.url, backend.key, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  }) as unknown as SupabaseClient;
  const signedIn = account
    ? await client.auth.signInWithPassword(account)
    : await client.auth.signInAnonymously();
  // The message of an auth error can name the account: say only which bot failed.
  if (signedIn.error) throw new Error(`bot ${index}: sign-in failed`);
  const api = createApi(client as never, { validate: true });
  const profile = await api.updateProfile({
    display_name: `Bot ${index}`,
    country: 'FR',
    avatar_key: AVATAR_KEYS[(index - 1) % AVATAR_KEYS.length],
  });
  if (profile.status !== 'ok') throw new Error(`bot ${index}: profile refused (${profile.status})`);
  return { index, client, api };
}

/** The api one seat votes through: same calls, with the answer times and the ledger on the side. */
function measuredApi(bot: RunBot, roomId: string, memberId: string, rec: Recorder) {
  const base = bot.api;
  return {
    ...base,
    async castVote(args: Parameters<Api['castVote']>[0]) {
      const started = performance.now();
      try {
        const result = await base.castVote(args);
        const answered = performance.now();
        rec.castVoteMs.push(answered - started);
        rec.ledger.voteAnswered(memberId, args.title_id, result.status);
        if (result.status === 'ok' && result.match) {
          rec.tracker.voteAnswered(roomId, args.title_id, memberId, answered);
        }
        return result;
      } catch (error) {
        rec.castVoteErrors += 1;
        throw error;
      }
    },
    async undoLastVote(args: Parameters<Api['undoLastVote']>[0]) {
      const result = await base.undoLastVote(args);
      if (result.status === 'ok') rec.ledger.undone(memberId, result.title_id);
      return result;
    },
    async requestCards(args: Parameters<Api['requestCards']>[0]) {
      const result = await base.requestCards(args);
      if (result.status === 'ok' && result.fallback) rec.fallbackDeals += 1;
      return result;
    },
  };
}

function fail(rec: Recorder, reason: string): 'failed' {
  rec.failures[reason] = (rec.failures[reason] ?? 0) + 1;
  return 'failed';
}

export type CycleEnd = 'pick' | 'no_pick' | 'gave_up' | 'failed';

export type CycleOptions = {
  bots: RunBot[];
  rec: Recorder;
  seed: number;
  swipeMs: number;
  likeRate: number;
  /** Resolves when the run is ending: running rooms then get `graceMs` to finish. */
  stopping: Promise<void>;
  /** A second Ctrl-C: stop waiting for the grace period. */
  force: Promise<void>;
  graceMs: number;
  cycleTimeoutMs: number;
};

/** Plays one game from a new room to a pick (or gives up), then leaves the room. */
export async function playCycle(options: CycleOptions): Promise<CycleEnd> {
  const { bots, rec } = options;
  const host = bots[0]!;
  const created = await host.api.createRoom({ country: 'FR' });
  if (created.status !== 'ok') return fail(rec, `create:${created.status}`);
  rec.rooms.started += 1;
  const { room_id: roomId, code } = created;

  const seats: { bot: RunBot; memberId: string; stop: () => Promise<void> }[] = [];
  let finished: (end: { state: string; outcome?: string }) => void = () => {};
  const done = new Promise<{ state: string; outcome?: string }>((resolve) => (finished = resolve));
  let decidedSeen = false;

  try {
    // The host's own seat comes from joining its room: a rejoin answers with the seat id.
    for (const bot of bots) {
      const joined = await bot.api.joinRoom({ code, via: 'code' });
      if (joined.status !== 'ok') return fail(rec, `join:${joined.status}`);
      const memberId = joined.member_id;
      const api = measuredApi(bot, roomId, memberId, rec);
      const attached = attachSeat({
        client: bot.client,
        api,
        roomId,
        memberId,
        initialState: joined.state,
        label: `bot ${bot.index}`,
        personality: makePersonality(options.seed, bot.index, 'mixed'),
        random: seededRandom((options.seed * 17 + bot.index * 131) >>> 0),
        swipeMs: options.swipeMs,
        likeRate: options.likeRate,
        hooks: {
          onMatch: (payload) => {
            // A Final Cut's result is a `match` too, but no vote caused it.
            if (payload.kind !== 'finale') {
              rec.tracker.eventSeen(roomId, payload.title_id, memberId, performance.now());
            }
            if (payload.decided) decidedSeen = true;
          },
          onState: (state, payload) => {
            if (state === 'done' || state === 'abandoned')
              finished({ state, outcome: payload.outcome });
          },
        },
      });
      seats.push({ bot, memberId, stop: attached.stop });
    }

    // Let the channels subscribe and the first heartbeats land, then start (two present seats).
    await sleep(1500);
    let begun: number | null = null;
    for (let attempt = 0; attempt < 10 && begun === null; attempt += 1) {
      const t0 = performance.now();
      const started = await host.api.startGame({ room_id: roomId });
      if (started.status === 'ok') {
        rec.startGameMs.push(performance.now() - t0);
        if (started.fallback) rec.fallbackDeals += 1;
        begun = performance.now();
      } else if (started.status === 'not_enough_players' || started.status === 'dealing') {
        await sleep(1000);
      } else {
        return fail(rec, `start:${started.status}`);
      }
    }
    if (begun === null) return fail(rec, 'start:never_enough_players');
    rec.rooms.cycles += 1;

    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), options.cycleTimeoutMs),
    );
    const stopped = Promise.race([
      options.stopping.then(() => sleep(options.graceMs)),
      options.force,
    ]).then(() => 'timeout' as const);
    const end = await Promise.race([done, timeout, stopped]);
    if (end === 'timeout') {
      rec.rooms.abandoned += 1;
      return 'gave_up';
    }
    if (end.state === 'done' && (decidedSeen || end.outcome !== 'no_pick')) {
      rec.rooms.picks += 1;
      rec.timeToPickMs.push(performance.now() - begun);
      return 'pick';
    }
    rec.rooms.noPicks += 1;
    return 'no_pick';
  } finally {
    // Bots never leave a room open: leave it, then drop the channels.
    await Promise.all(bots.map((bot) => bot.api.leaveRoom({ room_id: roomId }).catch(() => {})));
    await Promise.all(seats.map((seat) => seat.stop().catch(() => {})));
    rec.tracker.forgetRoom(roomId);
  }
}

// One bot player: a guest that sets a profile, joins a room by code and stays present the way
// the app does (realtime/controller.ts): presence on `room:<id>:live` keyed by its seat id,
// carrying only `swipe_count` and `done`, plus `api.touch_room` every 30 seconds.
// Once the room is `swiping` it swipes with a personality (personality.ts: its own like rate,
// pace, pauses, super likes, "Seen it" and Undo, and a taste partly shared with the room) until the
// room leaves `swiping`. In the Final Cut it locks in a ballot at a random moment, or never.
// It does not depend on the shortlist: it keeps swiping until the state changes.
// The seat part (`attachSeat`) is shared with the load runner (tools/load), which signs in with
// email accounts, hosts rooms and measures the calls.
//
// Rule 7: nothing here logs a code, a seat id, a user id, a token or a title. Logs say
// "bot 2 joined", "bot 2 liked a film" and "bot 2 locked in".
import {
  AVATAR_KEYS,
  createApi,
  roomLiveTopic,
  roomTopic,
  type LivePresence,
} from '@flimme/contract';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createPlayer, type FinaleRound, type PlayApi } from './play';
import { HEARTBEAT_MS, type Backend } from './config';
import {
  makePersonality,
  seededRandom,
  type Personality,
  type PersonalityMode,
} from './personality';

export type BotOptions = {
  index: number;
  backend: Backend;
  code: string;
  /** Base milliseconds per card; null uses the bot's own pace; 'off' only stays present. */
  swipeMs: number | null | 'off';
  /** Overrides the personality's like rate when set. */
  likeRate: number | null;
  seed: number;
  personality: PersonalityMode;
  /** Genres picked in the lobby right after joining (M6.54). */
  genres?: number[];
  /** Leave the room on stop. */
  leaveOnStop?: boolean;
  log?: (line: string) => void;
  random?: () => number;
};

export type Bot = { stop: () => Promise<void> };

export async function startBot(options: BotOptions): Promise<Bot> {
  const { index, backend, code } = options;
  const log = options.log ?? (() => {});
  const random = options.random ?? seededRandom((options.seed * 17 + options.index * 131) >>> 0);
  const personality = makePersonality(options.seed, options.index, options.personality);
  const label = `bot ${index}`;

  // A fresh in-memory session per bot: nothing is stored on disk.
  const client = createClient(backend.url, backend.key, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  }) as unknown as SupabaseClient;
  const api = createApi(client as never, { validate: true });

  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error) throw new Error(`${label}: sign-in failed`);

  const profile = await api.updateProfile({
    display_name: `Bot ${index}`,
    country: 'FR',
    avatar_key: AVATAR_KEYS[(index - 1) % AVATAR_KEYS.length],
  });
  if (profile.status !== 'ok') throw new Error(`${label}: profile refused (${profile.status})`);

  const joined = await api.joinRoom({ code, via: 'code' });
  if (joined.status !== 'ok') throw new Error(`${label}: could not join (${joined.status})`);
  log(`${label} joined`);

  if (options.genres && options.genres.length > 0) {
    // Genres alone, as the app sends them: a mixed call would also send `seat_updated`.
    const picked = await api.setSeatPrefs({ room_id: joined.room_id, genre_ids: options.genres });
    log(`${label} picked genres (${picked.status})`);
  }

  const seat = attachSeat({
    client,
    api,
    roomId: joined.room_id,
    memberId: joined.member_id,
    initialState: joined.state,
    label,
    personality,
    random,
    swipeMs: options.swipeMs,
    likeRate: options.likeRate,
    log,
  });

  return {
    async stop() {
      await seat.stop();
      if (options.leaveOnStop) await api.leaveRoom({ room_id: joined.room_id }).catch(() => {});
      await client.auth.signOut().catch(() => {});
    },
  };
}

export type SeatHooks = {
  /** A `match` event reached this seat (the payload as the server broadcast it). */
  onMatch?: (payload: { title_id: number; kind?: string; decided?: boolean }) => void;
  /** A `state_changed` event reached this seat. */
  onState?: (state: string, payload: { outcome?: string }) => void;
};

export type SeatOptions = {
  client: SupabaseClient;
  /** The api the player votes through; the load runner passes one that measures. */
  api: PlayApi & Pick<ReturnType<typeof createApi>, 'touchRoom'>;
  roomId: string;
  memberId: string;
  initialState: string;
  label: string;
  personality: Personality;
  random: () => number;
  swipeMs: number | null | 'off';
  likeRate: number | null;
  log?: (line: string) => void;
  hooks?: SeatHooks;
};

/**
 * A seat the bot already holds: presence on the live topic, the heartbeat, the room topic's
 * events and the swipe loop. Shared by `startBot` and the load runner (tools/load).
 */
export function attachSeat(options: SeatOptions): { stop: () => Promise<void> } {
  const { client, api, roomId, memberId, label, personality, random, hooks } = options;
  const log = options.log ?? (() => {});
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  let presence: LivePresence = { swipe_count: 0, done: false };

  const live = client.channel(roomLiveTopic(roomId), {
    config: { private: true, presence: { key: memberId } },
  });
  live.subscribe((status: string) => {
    // Track on every SUBSCRIBED, the first or a rejoin, as the app does.
    if (status === 'SUBSCRIBED') void live.track(presence).catch(() => {});
  });

  const setPresence = (next: LivePresence) => {
    presence = next;
    void live.track(presence).catch(() => {});
  };

  const beat = () => void api.touchRoom({ room_id: roomId }).catch(() => {});
  beat();
  const heartbeat = setInterval(beat, HEARTBEAT_MS);

  const player = createPlayer({
    api,
    roomId,
    memberId,
    label,
    personality,
    random,
    sleep,
    log,
    setPresence,
    swipeMs: options.swipeMs,
    likeRate: options.likeRate,
    initialState: options.initialState,
  });

  const events = client.channel(roomTopic(roomId), { config: { private: true } });
  events.on(
    'broadcast',
    { event: 'state_changed' },
    (message: { payload?: { state?: string; outcome?: string } }) => {
      if (!message.payload?.state) return;
      player.setState(message.payload.state);
      hooks?.onState?.(message.payload.state, message.payload);
    },
  );
  events.on('broadcast', { event: 'match' }, (message: { payload?: unknown }) => {
    if (message.payload) hooks?.onMatch?.(message.payload as { title_id: number });
  });
  events.on('broadcast', { event: 'finale_started' }, (message: { payload?: unknown }) => {
    const round = message.payload as FinaleRound | undefined;
    if (round) void player.playFinale(round).catch(() => {});
  });
  events.subscribe();
  if (options.initialState === 'swiping') player.setState('swiping');

  return {
    async stop() {
      player.stop();
      clearInterval(heartbeat);
      await client.removeChannel(live);
      await client.removeChannel(events);
    },
  };
}

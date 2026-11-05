// One bot player: a guest that sets a profile, joins a room by code and stays present the way
// the app does (realtime/controller.ts): presence on `room:<id>:live` keyed by its seat id,
// carrying only `swipe_count` and `done`, plus `api.touch_room` every 30 seconds.
// Once the room is `swiping` it swipes with a personality (personality.ts: its own like rate,
// pace, pauses, super likes, "Seen it" and Undo, and a taste partly shared with the room) until the
// room leaves `swiping`. In the Final Cut it locks in a ballot at a random moment, or never.
// It does not depend on the shortlist: it keeps swiping until the state changes.
// Still to come (M6.20, M9.7): many rooms, timing profiles, checking that a pick is reached.
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

import { createPlayer, type FinaleRound } from './play';
import { HEARTBEAT_MS, type Backend } from './config';
import { makePersonality, seededRandom, type PersonalityMode } from './personality';

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
  log?: (line: string) => void;
  random?: () => number;
};

export type Bot = { stop: () => Promise<void> };

export async function startBot(options: BotOptions): Promise<Bot> {
  const { index, backend, code } = options;
  const log = options.log ?? (() => {});
  const random = options.random ?? seededRandom((options.seed * 17 + options.index * 131) >>> 0);
  const personality = makePersonality(options.seed, options.index, options.personality);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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
  const { room_id: roomId, member_id: memberId } = joined;
  log(`${label} joined`);

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
    initialState: joined.state,
  });

  const events = client.channel(roomTopic(roomId), { config: { private: true } });
  events.on(
    'broadcast',
    { event: 'state_changed' },
    (message: { payload?: { state?: string } }) => {
      if (message.payload?.state) player.setState(message.payload.state);
    },
  );
  events.on('broadcast', { event: 'finale_started' }, (message: { payload?: unknown }) => {
    const round = message.payload as FinaleRound | undefined;
    if (round) void player.playFinale(round).catch(() => {});
  });
  events.subscribe();
  if (joined.state === 'swiping') player.setState('swiping');

  return {
    async stop() {
      player.stop();
      clearInterval(heartbeat);
      await client.removeChannel(live);
      await client.removeChannel(events);
      await client.auth.signOut().catch(() => {});
    },
  };
}

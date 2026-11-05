// One bot player: a guest that sets a profile, joins a room by code and stays present the way
// the app does (realtime/controller.ts): presence on `room:<id>:live` keyed by its seat id,
// carrying only `swipe_count` and `done`, plus `api.touch_room` every 30 seconds.
// Optionally it swipes once the room is `swiping`. M6.19 builds the full player on top of this
// (Final Cut ballots, reconnect handling, timing profiles, many rooms).
//
// Rule 7: nothing here logs a code, a seat id, a user id, a token or a title. Logs say
// "bot 2 joined" and nothing else.
import {
  AVATAR_KEYS,
  createApi,
  roomLiveTopic,
  roomTopic,
  type LivePresence,
} from '@flimme/contract';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { HEARTBEAT_MS, type Backend } from './config';

export type BotOptions = {
  index: number;
  backend: Backend;
  code: string;
  swipeMs: number | null;
  likeRate: number;
  log?: (line: string) => void;
  random?: () => number;
};

export type Bot = { stop: () => Promise<void> };

export async function startBot(options: BotOptions): Promise<Bot> {
  const { index, backend, code } = options;
  const log = options.log ?? (() => {});
  const random = options.random ?? Math.random;
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
  let stopped = false;
  let swiping = false;

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

  async function swipeLoop() {
    if (options.swipeMs === null || swiping) return;
    swiping = true;
    try {
      while (!stopped) {
        const cards = await api.myNextCards({ room_id: roomId, limit: 10 });
        if (cards.length === 0) {
          setPresence({ ...presence, done: true });
          return;
        }
        for (const card of cards) {
          if (stopped) return;
          await new Promise((resolve) => setTimeout(resolve, options.swipeMs! * (0.5 + random())));
          const answer = random() < options.likeRate ? 'like' : 'nope';
          const result = await api.castVote({
            room_id: roomId,
            title_id: card.title_id,
            answer,
            member_id: memberId,
            client_at: new Date().toISOString(),
          });
          if (result.status === 'closed') return;
          if (result.status === 'ok')
            setPresence({ ...presence, swipe_count: presence.swipe_count + 1 });
        }
      }
    } catch {
      // A failed call ends this round; the next state_changed starts it again.
    } finally {
      swiping = false;
    }
  }

  const events = client.channel(roomTopic(roomId), { config: { private: true } });
  events.on(
    'broadcast',
    { event: 'state_changed' },
    (message: { payload?: { state?: string } }) => {
      if (message.payload?.state === 'swiping') void swipeLoop();
    },
  );
  events.subscribe();
  if (joined.state === 'swiping') void swipeLoop();

  return {
    async stop() {
      stopped = true;
      clearInterval(heartbeat);
      await client.removeChannel(live);
      await client.removeChannel(events);
      await client.auth.signOut().catch(() => {});
    },
  };
}

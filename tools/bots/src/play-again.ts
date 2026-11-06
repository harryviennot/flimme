// The `play-again` action (M6.23), for the touch run of Play again and the Join offer.
//   Guests: `mise run bots -- play-again --code 482913 --count 3 --target staging`
//     Bots join the room, play it with their personalities, and when `next_room` arrives on the
//     room's topic they join the new room by its code (via `play_again`) and stay present there.
//   Host: `mise run bots -- play-again --as host --count 2 --target staging`
//     The first bot opens a room and prints its code (the one place a code is printed: the person
//     running the touch run must type it on the phone). Others join. When `--count` bots plus one
//     human are seated, the host starts the game, plays, and once the room is `done` it calls
//     `api.play_again` after a short pause, so the phone sees the Join offer.
// Rule 7 otherwise holds: no seat id, user id, token or title in a log line.
import {
  AVATAR_KEYS,
  createApi,
  roomTopic,
  type JoinRoomResult,
  type RoomEventPayloads,
} from '@flimme/contract';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { attachSeat } from './bot';
import type { Backend, BotConfig } from './config';
import { makePersonality, seededRandom } from './personality';

/** What a bot does with a `next_room` payload: the arguments of its `joinRoom` call, or nothing. */
export function nextRoomJoin(
  payload: unknown,
): { code: string; ref: string; via: 'play_again' } | null {
  const next = payload as Partial<RoomEventPayloads['next_room']> | null | undefined;
  if (!next || typeof next.code !== 'string' || typeof next.room_id !== 'string') return null;
  return { code: next.code, ref: next.room_id, via: 'play_again' };
}

type Seat = { stop: () => Promise<void> };

async function signedInBot(backend: Backend, index: number) {
  const client = createClient(backend.url, backend.key, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  }) as unknown as SupabaseClient;
  const api = createApi(client as never, { validate: true });
  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error) throw new Error(`bot ${index}: sign-in failed`);
  const profile = await api.updateProfile({
    display_name: `Bot ${index}`,
    country: 'FR',
    avatar_key: AVATAR_KEYS[(index - 1) % AVATAR_KEYS.length],
  });
  if (profile.status !== 'ok') throw new Error(`bot ${index}: profile refused`);
  return { client, api };
}

export async function runPlayAgain(
  config: BotConfig,
  backend: Backend,
  log: (line: string) => void,
): Promise<() => Promise<void>> {
  const seats: Seat[] = [];
  const clients: SupabaseClient[] = [];
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const sit = (
    index: number,
    client: SupabaseClient,
    api: ReturnType<typeof createApi>,
    joined: Extract<JoinRoomResult, { status: 'ok' }>,
    onState?: (state: string) => void,
  ) => {
    const seat = attachSeat({
      client,
      api,
      roomId: joined.room_id,
      memberId: joined.member_id,
      initialState: joined.state,
      label: `bot ${index}`,
      personality: makePersonality(config.seed, index, config.personality),
      random: seededRandom((config.seed * 17 + index * 131) >>> 0),
      swipeMs: config.swipeMs,
      likeRate: config.likeRate,
      log,
      hooks: { onState: (state) => onState?.(state) },
    });
    seats.push(seat);
    return seat;
  };

  // Follows `next_room` on the room the bot sits in, once.
  const follow = (
    index: number,
    client: SupabaseClient,
    api: ReturnType<typeof createApi>,
    roomId: string,
  ) => {
    const events = client.channel(roomTopic(roomId), { config: { private: true } });
    events.on('broadcast', { event: 'next_room' }, (message: { payload?: unknown }) => {
      const args = nextRoomJoin(message.payload);
      if (!args) return;
      void api
        .joinRoom(args)
        .then((joined) => {
          if (joined.status !== 'ok') return log(`bot ${index} could not join the next game`);
          log(`bot ${index} joined the next game`);
          sit(index, client, api, joined);
        })
        // A slow staging call must not end the other bots.
        .catch(() => log(`bot ${index} could not reach the next game`));
    });
    events.subscribe();
    seats.push({ stop: async () => void (await client.removeChannel(events)) });
  };

  if (config.as === 'guest') {
    for (let index = 1; index <= config.count; index += 1) {
      const { client, api } = await signedInBot(backend, index);
      clients.push(client);
      const joined = await api.joinRoom({ code: config.code, via: 'code' });
      if (joined.status !== 'ok')
        throw new Error(`bot ${index}: could not join (${joined.status})`);
      log(`bot ${index} joined`);
      sit(index, client, api, joined);
      follow(index, client, api, joined.room_id);
    }
  } else {
    const host = await signedInBot(backend, 1);
    clients.push(host.client);
    const created = await host.api.createRoom({ country: 'FR' });
    if (created.status !== 'ok') throw new Error(`host: could not open a room (${created.status})`);
    // The code goes to the person at the phone: the one line that prints it.
    console.log(`Room code: ${created.code}`);
    const joinedHost = await host.api.joinRoom({ code: created.code, via: 'code' });
    if (joinedHost.status !== 'ok') throw new Error('host: could not sit in its own room');
    let asked = false;
    sit(1, host.client, host.api, joinedHost, (state) => {
      if (state !== 'done' || asked) return;
      asked = true;
      void sleep(3000).then(async () => {
        const next = await host.api.playAgain({ room_id: joinedHost.room_id });
        log(next.status === 'ok' ? 'host opened the next game' : `play again: ${next.status}`);
      });
    });
    for (let index = 2; index <= config.count; index += 1) {
      const { client, api } = await signedInBot(backend, index);
      clients.push(client);
      const joined = await api.joinRoom({ code: created.code, via: 'code' });
      if (joined.status !== 'ok') throw new Error(`bot ${index}: could not join`);
      log(`bot ${index} joined`);
      sit(index, client, api, joined);
    }
    // Wait for the phone: one more seat than the bots, then start.
    void (async () => {
      for (let waited = 0; waited < 300; waited += 1) {
        const present = (await host.api.roomSeats({ room_id: joinedHost.room_id })).filter(
          (seat) => seat.left_at === null,
        );
        if (present.length > config.count) break;
        await sleep(2000);
      }
      await host.api.touchRoom({ room_id: joinedHost.room_id }).catch(() => {});
      const started = await host.api.startGame({ room_id: joinedHost.room_id });
      log(`host started the game: ${started.status}`);
    })().catch((error) => log(String(error.message ?? error)));
  }

  return async () => {
    await Promise.all(seats.map((seat) => seat.stop().catch(() => {})));
    await Promise.all(clients.map((client) => client.auth.signOut().catch(() => {})));
  };
}

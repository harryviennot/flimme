import { describe, expect, it } from 'vitest';

import {
  CREATE_ROOM_ANSWERS,
  JOIN_ROOM_ANSWERS,
  LEAVE_ROOM_ANSWERS,
  SET_MY_PROVIDERS_ANSWERS,
  SET_SEAT_PREFS_ANSWERS,
  START_GAME_ANSWERS,
  UPDATE_PROFILE_ANSWERS,
  UPDATE_ROOM_SETTINGS_ANSWERS,
} from '../answers';
import { ApiError, createApi, type ApiClient } from './index';

type Response = {
  data: unknown;
  error: { message: string; code?: string } | null;
  status?: number;
};

/** A client whose `rpc` and `from` answer with what the test says. */
function fake(respond: (fn: string, args: unknown) => Response | Promise<Response>) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return respond(fn, args);
    },
    from: (view: string) => ({
      select: () => {
        const result = Promise.resolve(respond(view, null)) as Promise<Response> & {
          limit: () => Promise<Response>;
        };
        result.limit = () => Promise.resolve(respond(view, null));
        return result;
      },
    }),
  } as unknown as ApiClient;
  return { client, calls };
}
const ok = (data: unknown): Response => ({ data, error: null, status: 200 });

const ROOM = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';

// Every answer of every wrapped function, with the extra fields the SQL sends.
const cases = [
  {
    name: 'update_profile',
    answers: UPDATE_PROFILE_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.updateProfile({ display_name: 'Léa' }),
    full: { invalid_name: {} },
  },
  {
    name: 'set_my_providers',
    answers: SET_MY_PROVIDERS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.setMyProviders({ provider_ids: [8] }),
    full: { too_many: { max: 50 } },
  },
  {
    name: 'create_room',
    answers: CREATE_ROOM_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.createRoom({ mode: 'quick_match' }),
    full: { ok: { room_id: ROOM, code: '482915' } },
  },
  {
    name: 'join_room',
    answers: JOIN_ROOM_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.joinRoom({ code: '482915' }),
    full: { ok: { room_id: ROOM, member_id: MEMBER, state: 'lobby', rejoined: false } },
  },
  {
    name: 'leave_room',
    answers: LEAVE_ROOM_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.leaveRoom({ room_id: ROOM }),
    full: {},
  },
  {
    name: 'update_room_settings',
    answers: UPDATE_ROOM_SETTINGS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) =>
      a.updateRoomSettings({ room_id: ROOM, settings: { reveal: 'blind' } }),
    full: { invalid_settings: { field: 'max_age' } },
  },
  {
    name: 'set_seat_prefs',
    answers: SET_SEAT_PREFS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) =>
      a.setSeatPrefs({ room_id: ROOM, mood_slugs: ['cosy'] }),
    full: { too_many: { field: 'mood_slugs', max: 3 } },
  },
  {
    name: 'start_game',
    answers: START_GAME_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.startGame({ room_id: ROOM }),
    full: {
      ok: { request_id: null, started: false, seats: 0 },
      closed: { state: 'swiping' },
      not_enough_players: { need: 2 },
    },
  },
] as const;

describe('every answer resolves as a value', () => {
  for (const c of cases) {
    for (const status of c.answers) {
      it(`${c.name}: ${status}`, async () => {
        const extra = (c.full as Record<string, object>)[status] ?? {};
        const { client } = fake(() => ok({ status, ...extra }));
        const result = await c.call(createApi(client, { validate: true }));
        expect(result).toMatchObject({ status, ...extra });
      });
    }
  }
});

describe('arguments', () => {
  it('sends the SQL parameter names with p_ and leaves unset ones out', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok' }));
    await createApi(client).setSeatPrefs({ room_id: ROOM, genre_ids: [18] });
    expect(calls[0]).toEqual({
      fn: 'set_seat_prefs',
      args: {
        p_room_id: ROOM,
        p_genre_ids: [18],
        p_provider_ids: undefined,
        p_mood_slugs: undefined,
        p_member_id: undefined,
      },
    });
  });

  it('touch_room returns nothing', async () => {
    const { client, calls } = fake(() => ok(null));
    await expect(createApi(client).touchRoom({ room_id: ROOM })).resolves.toBeUndefined();
    expect(calls[0]?.fn).toBe('touch_room');
  });

  it('touch_room rejects as denied on 42501', async () => {
    const { client } = fake(() => ({
      data: null,
      error: { message: 'no profile', code: '42501' },
      status: 403,
    }));
    await expect(createApi(client).touchRoom({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'denied',
    });
  });

  it('a wrong argument type is a compile error', () => {
    const { client } = fake(() => ok({ status: 'ok' }));
    const api = createApi(client);
    // @ts-expect-error code is a string
    void api.joinRoom({ code: 482915 });
    // @ts-expect-error room_id is required
    void api.startGame({});
    // @ts-expect-error unknown setting
    void api.updateRoomSettings({ room_id: ROOM, settings: { colour: 'red' } });
    // @ts-expect-error provider ids are numbers
    void api.setMyProviders({ provider_ids: ['8'] });
  });
});

describe('only bugs reject', () => {
  it('an answer outside the list is unexpected', async () => {
    const { client } = fake(() => ok({ status: 'teapot' }));
    const error = await createApi(client)
      .joinRoom({ code: '1' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'unexpected', fn: 'join_room' });
  });

  it('an answer that belongs to another function is unexpected', async () => {
    const { client } = fake(() => ok({ status: 'not_found' }));
    await expect(createApi(client).leaveRoom({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('a payload that is not an object is unexpected', async () => {
    const { client } = fake(() => ok(null));
    await expect(createApi(client).startGame({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('PostgREST 42501 is denied', async () => {
    const { client } = fake(() => ({
      data: null,
      error: { message: 'only the host can start', code: '42501' },
      status: 403,
    }));
    await expect(createApi(client).startGame({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'denied',
      code: '42501',
    });
  });

  it('a failed fetch is network', async () => {
    const { client } = fake(() => ({
      data: null,
      error: { message: 'TypeError: Network request failed', code: '' },
      status: 0,
    }));
    await expect(createApi(client).joinRoom({ code: '1' })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('a thrown fetch is network', async () => {
    const { client } = fake(() => {
      throw new TypeError('Network request failed');
    });
    await expect(createApi(client).touchRoom({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('any other database error is unexpected', async () => {
    const { client } = fake(() => ({
      data: null,
      error: { message: 'boom', code: '22023' },
      status: 400,
    }));
    await expect(createApi(client).leaveRoom({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'unexpected',
      code: '22023',
    });
  });
});

describe('payload checks', () => {
  it('a payload of the wrong shape is unexpected when checks are on', async () => {
    const { client } = fake(() => ok({ status: 'ok', room_id: ROOM }));
    await expect(
      createApi(client, { validate: true }).joinRoom({ code: '1' }),
    ).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('a missing field on a status that needs one is unexpected', async () => {
    const { client } = fake(() => ok({ status: 'not_enough_players' }));
    await expect(
      createApi(client, { validate: true }).startGame({ room_id: ROOM }),
    ).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('the same payload passes through when checks are off', async () => {
    const { client } = fake(() => ok({ status: 'ok', room_id: ROOM }));
    await expect(createApi(client).joinRoom({ code: '1' })).resolves.toMatchObject({
      status: 'ok',
    });
  });
});

describe('views', () => {
  const profile = {
    id: ROOM,
    display_name: 'Léa',
    avatar_key: 'teal',
    country: 'FR',
    language: 'fr',
    created_at: '2026-11-03T10:00:00Z',
  };

  it('my_profile returns the row, or null when there is none', async () => {
    const api = createApi(fake(() => ok([profile])).client, { validate: true });
    await expect(api.myProfile()).resolves.toEqual(profile);
    await expect(createApi(fake(() => ok([])).client).myProfile()).resolves.toBeNull();
  });

  it('my_profile with a wrong shape is unexpected when checks are on', async () => {
    const api = createApi(fake(() => ok([{ id: ROOM }])).client, { validate: true });
    await expect(api.myProfile()).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('app_config keeps the keys the app reads and ignores the rest', async () => {
    const rows = [
      { key: 'min_app_version', value: { ios: '1.0.0', android: '1.0.0' } },
      { key: 'tmdb_image_base', value: 'https://image.tmdb.org/t/p/' },
      { key: 'deck_engine', value: 'sql' },
    ];
    const api = createApi(fake(() => ok(rows)).client, { validate: true });
    await expect(api.appConfig()).resolves.toEqual({
      min_app_version: { ios: '1.0.0', android: '1.0.0' },
      tmdb_image_base: 'https://image.tmdb.org/t/p/',
    });
  });

  it('app_config with a missing key leaves it undefined', async () => {
    const api = createApi(fake(() => ok([])).client, { validate: true });
    await expect(api.appConfig()).resolves.toEqual({});
  });

  it('a view error is classified like a function error', async () => {
    const api = createApi(
      fake(() => ({ data: null, error: { message: 'denied', code: '42501' }, status: 403 })).client,
    );
    await expect(api.appConfig()).rejects.toMatchObject({ kind: 'denied' });
  });
});

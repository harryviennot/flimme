import { describe, expect, it } from 'vitest';

import {
  CREATE_ROOM_ANSWERS,
  JOIN_ROOM_ANSWERS,
  ROOM_PREVIEW_ANSWERS,
  REPORT_MEMBER_ANSWERS,
  LEAVE_ROOM_ANSWERS,
  REMOVE_MEMBER_ANSWERS,
  SET_ROOM_LOCKED_ANSWERS,
  SET_MY_PROVIDERS_ANSWERS,
  SET_SEAT_PREFS_ANSWERS,
  START_GAME_ANSWERS,
  UPDATE_PROFILE_ANSWERS,
  UPDATE_ROOM_SETTINGS_ANSWERS,
} from '../answers';
import { AVATAR_KEYS } from '../avatars';
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
          eq: (column: string, value: unknown) => typeof result;
          order: (column: string) => typeof result;
        };
        result.limit = () => Promise.resolve(respond(view, null));
        result.eq = (column, value) => {
          calls.push({ fn: `${view}.eq`, args: [column, value] });
          return result;
        };
        result.order = (column) => {
          calls.push({ fn: `${view}.order`, args: column });
          return result;
        };
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
    full: { ok: { display_name: 'Léa', avatar_key: 'blue' } },
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
    full: { ok: { room_id: ROOM, code: '482915' }, invalid_settings: { field: 'max_age' } },
  },
  {
    name: 'join_room',
    answers: JOIN_ROOM_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.joinRoom({ code: '482915' }),
    full: {
      ok: { room_id: ROOM, member_id: MEMBER, state: 'lobby', rejoined: false },
      full: { max_players: 10 },
      name_required: { host_name: 'Camille' },
    },
  },
  {
    name: 'room_preview',
    answers: ROOM_PREVIEW_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.roomPreview({ code: '482915', ref: ROOM }),
    full: {
      ok: {
        state: 'lobby',
        host_name: 'Camille',
        host_avatar_key: 'blue',
        players: 3,
        max_players: 10,
        seated: false,
      },
      full: { max_players: 10 },
    },
  },
  {
    name: 'report_member',
    answers: REPORT_MEMBER_ANSWERS,
    call: (a: ReturnType<typeof createApi>) =>
      a.reportMember({ room_id: ROOM, member_id: MEMBER, reason: 'spam' }),
    full: {},
  },
  {
    name: 'leave_room',
    answers: LEAVE_ROOM_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.leaveRoom({ room_id: ROOM }),
    full: {},
  },
  {
    name: 'remove_member',
    answers: REMOVE_MEMBER_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.removeMember({ room_id: ROOM, member_id: MEMBER }),
    full: {},
  },
  {
    name: 'set_room_locked',
    answers: SET_ROOM_LOCKED_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.setRoomLocked({ room_id: ROOM, locked: true }),
    full: { ok: { locked: true } },
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

  it('create_room sends the settings as p_settings', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok', room_id: ROOM, code: '482915' }));
    await createApi(client).createRoom({
      mode: 'quick_match',
      country: 'FR',
      settings: { runtime_max: 105, max_age: null },
    });
    expect(calls[0]).toEqual({
      fn: 'create_room',
      args: {
        p_mode: 'quick_match',
        p_country: 'FR',
        p_settings: { runtime_max: 105, max_age: null },
      },
    });
  });

  it('room_preview sends the code and the reference', async () => {
    const { client, calls } = fake(() => ok({ status: 'closed' }));
    await createApi(client).roomPreview({ code: '482915', ref: ROOM });
    expect(calls[0]).toEqual({ fn: 'room_preview', args: { p_code: '482915', p_ref: ROOM } });
  });

  it('report_member sends the room, the seat and the reason', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok' }));
    await createApi(client).reportMember({ room_id: ROOM, member_id: MEMBER, reason: 'other' });
    expect(calls[0]).toEqual({
      fn: 'report_member',
      args: { p_room_id: ROOM, p_member_id: MEMBER, p_reason: 'other' },
    });
  });

  it('join_room sends the reference, how the player came in and when the link was opened', async () => {
    const { client, calls } = fake(() => ok({ status: 'closed' }));
    await createApi(client).joinRoom({
      code: '482915',
      ref: ROOM,
      via: 'link',
      link_opened_at: '2026-11-03T12:00:00Z',
    });
    expect(calls[0]).toEqual({
      fn: 'join_room',
      args: {
        p_code: '482915',
        p_ref: ROOM,
        p_via: 'link',
        p_link_opened_at: '2026-11-03T12:00:00Z',
      },
    });
  });

  it('name_required may carry no host name', async () => {
    const { client } = fake(() => ok({ status: 'name_required', host_name: null }));
    await expect(
      createApi(client, { validate: true }).joinRoom({ code: '482915' }),
    ).resolves.toEqual({ status: 'name_required', host_name: null });
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

describe('provider readers', () => {
  const row = { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 };

  it('countryProviders filters on the country and orders by display_priority', async () => {
    const { client, calls } = fake(() => ok([row]));
    const rows = await createApi(client, { validate: true }).countryProviders({ country: 'FR' });
    expect(rows).toEqual([row]);
    expect(calls).toContainEqual({ fn: 'country_providers.eq', args: ['country', 'FR'] });
    expect(calls).toContainEqual({ fn: 'country_providers.order', args: 'display_priority' });
  });

  it('countryProviders rejects a wrong shape as unexpected when checks are on', async () => {
    const { client } = fake(() => ok([{ provider_id: '8' }]));
    await expect(
      createApi(client, { validate: true }).countryProviders({ country: 'FR' }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('countryProviders returns no rows as an empty list', async () => {
    const { client } = fake(() => ok(null));
    await expect(createApi(client).countryProviders({ country: 'FR' })).resolves.toEqual([]);
  });

  it('gameModes reads the view in display order', async () => {
    const mode = {
      slug: 'quick_match',
      min_players: 2,
      max_players: 10,
      ends_on_first_match: true,
      sort: 1,
    };
    const { client, calls } = fake(() => ok([mode]));
    await expect(createApi(client, { validate: true }).gameModes()).resolves.toEqual([mode]);
    expect(calls).toContainEqual({ fn: 'game_modes.order', args: 'sort' });
  });

  it('gameModes rejects a wrong shape as unexpected when checks are on', async () => {
    const { client } = fake(() => ok([{ slug: 1 }]));
    await expect(createApi(client, { validate: true }).gameModes()).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });

  it('gameModes returns no rows as an empty list', async () => {
    const { client } = fake(() => ok(null));
    await expect(createApi(client).gameModes()).resolves.toEqual([]);
  });

  it('myProviders maps rows to ids', async () => {
    const { client } = fake(() => ok([{ provider_id: 8 }, { provider_id: 9 }]));
    await expect(createApi(client).myProviders()).resolves.toEqual([8, 9]);
  });

  it('myProviders returns [] for none', async () => {
    const { client } = fake(() => ok([]));
    await expect(createApi(client).myProviders()).resolves.toEqual([]);
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

  const roomFixture = {
    id: ROOM,
    code: '482915',
    mode: 'quick_match',
    state: 'lobby',
    country: 'FR',
    service_rule: 'any_member',
    offer_kinds: ['subscription', 'free'],
    runtime_max: null,
    seen_rule: 'hide_seen',
    quality: 'standard',
    max_age: null,
    reveal: 'party',
    max_players: 10,
    provider_ids: [8],
    stats: null,
    created_at: '2026-11-03T10:00:00Z',
    started_at: null,
    finale_at: null,
    decided_at: null,
    ended_at: null,
    locked: false,
  };
  const seatFixture = {
    member_id: MEMBER,
    room_id: ROOM,
    role: 'host',
    display_name: 'Léa',
    avatar_key: 'teal',
    provider_ids: [],
    joined_at: '2026-11-03T10:00:00Z',
    left_at: null,
    calibrated_at: null,
    done_at: null,
    swipe_count: 0,
    super_likes_left: 1,
    vetoes_left: 1,
    is_me: true,
    is_mine: true,
  };
  const denied = () => ({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });

  it('rooms returns the row or null, filtered by id', async () => {
    const { client, calls } = fake(() => ok([roomFixture]));
    await expect(createApi(client, { validate: true }).room({ room_id: ROOM })).resolves.toEqual(
      roomFixture,
    );
    expect(calls).toContainEqual({ fn: 'rooms.eq', args: ['id', ROOM] });
    await expect(createApi(fake(() => ok([])).client).room({ room_id: ROOM })).resolves.toBeNull();
  });

  it('rooms with a wrong shape is unexpected when checks are on', async () => {
    const api = createApi(fake(() => ok([{ id: ROOM }])).client, { validate: true });
    await expect(api.room({ room_id: ROOM })).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('room_seats sends the filter and both orders, and returns [] for no rows', async () => {
    const { client, calls } = fake(() => ok([seatFixture]));
    await expect(
      createApi(client, { validate: true }).roomSeats({ room_id: ROOM }),
    ).resolves.toEqual([seatFixture]);
    expect(calls).toEqual([
      { fn: 'room_seats.eq', args: ['room_id', ROOM] },
      { fn: 'room_seats.order', args: 'joined_at' },
      { fn: 'room_seats.order', args: 'member_id' },
    ]);
    await expect(
      createApi(fake(() => ok([])).client).roomSeats({ room_id: ROOM }),
    ).resolves.toEqual([]);
  });

  it('room_seats with a wrong shape is unexpected when checks are on', async () => {
    const api = createApi(fake(() => ok([{ member_id: MEMBER }])).client, { validate: true });
    await expect(api.roomSeats({ room_id: ROOM })).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('rooms and room_seats reject as denied on 42501', async () => {
    const api = createApi(fake(denied).client);
    await expect(api.room({ room_id: ROOM })).rejects.toMatchObject({ kind: 'denied' });
    await expect(api.roomSeats({ room_id: ROOM })).rejects.toMatchObject({ kind: 'denied' });
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

describe('avatars', () => {
  it('pins the six preset keys, in order', () => {
    expect(AVATAR_KEYS).toEqual(['blue', 'green', 'gold', 'red', 'violet', 'teal']);
  });
});

import { describe, expect, it } from 'vitest';

import {
  CAST_BALLOT_ANSWERS,
  CAST_VOTE_ANSWERS,
  CLOSE_ROUND_STAGE_ANSWERS,
  ROUND_PROGRESS_ANSWERS,
  REQUEST_CARDS_ANSWERS,
  UNDO_LAST_VOTE_ANSWERS,
  CREATE_ROOM_ANSWERS,
  JOIN_ROOM_ANSWERS,
  ROOM_PREVIEW_ANSWERS,
  REPORT_MEMBER_ANSWERS,
  EXPORT_MY_DATA_ANSWERS,
  SET_ANALYTICS_CHOICE_ANSWERS,
  LEAVE_ROOM_ANSWERS,
  REMOVE_MEMBER_ANSWERS,
  SET_ROOM_LOCKED_ANSWERS,
  SET_MY_PROVIDERS_ANSWERS,
  SET_SEAT_PREFS_ANSWERS,
  START_GAME_ANSWERS,
  START_SOLO_ANSWERS,
  SOLO_PICK_ANSWERS,
  TITLE_CARDS_ANSWERS,
  MY_FILMS_ANSWERS,
  MY_FILM_CARD_ANSWERS,
  SET_FILM_SEEN_ANSWERS,
  REMOVE_MY_FILM_ANSWERS,
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
const CARD = {
  title_id: 7,
  tmdb_id: 60000007,
  title: 'Film Fictif',
  overview: null,
  year: 2001,
  runtime_min: 100,
  genre_ids: [18],
  tmdb_score: 7.5,
  tmdb_votes: 1000,
  poster_path: '/p.jpg',
  poster_placeholder: null,
  backdrop_path: '/b.jpg',
  trailer_key: null,
  directors: ['Dora Director'],
  cast: ['Alma Actor'],
  providers: [{ provider_id: 8, kind: 'subscription', name: 'Service', logo_path: null }],
  watch_link: null,
};

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
    name: 'set_analytics_choice',
    answers: SET_ANALYTICS_CHOICE_ANSWERS,
    call: (a: ReturnType<typeof createApi>) =>
      a.setAnalyticsChoice({ choice: 'off', version: 'v1' }),
    full: { ok: { choice: 'off' } },
  },
  {
    name: 'export_my_data',
    answers: EXPORT_MY_DATA_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.exportMyData(),
    full: {
      ok: {
        profile: { id: MEMBER },
        services: [8],
        consents: [],
        linked_accounts: [],
        letterboxd_diary: [],
        film_history: [],
        taste: null,
        games: [
          {
            room_id: ROOM,
            mode: 'quick_match',
            joined_at: '2026-11-04T20:00:00Z',
            left_at: null,
            display_name: 'Camille',
            avatar_key: 'blue',
            role: 'host',
            joined_via: 'code',
            services: [8],
            votes: [
              { tmdb_id: 603, title: 'The Matrix', answer: 'like', at: '2026-11-04T20:01:00Z' },
            ],
            swipes: [
              {
                tmdb_id: 603,
                action: 'vote',
                answer: 'like',
                at: '2026-11-04T20:01:00Z',
                dwell_ms: null,
              },
            ],
            ballots: [{ tmdb_id: null, kind: 'pass', rank: null, at: '2026-11-04T20:10:00Z' }],
            pick: null,
            watched_answer: null,
            post_reaction: null,
          },
        ],
      },
    },
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
      too_few_films: { eligible: 12 },
    },
  },
  {
    name: 'start_solo',
    answers: START_SOLO_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.startSolo({ settings: { quality: 'standard' } }),
    full: {
      ok: { room_id: ROOM, member_id: MEMBER, state: 'swiping' },
      dealing: { room_id: ROOM, member_id: MEMBER },
      invalid_settings: { field: 'seen_rule' },
      too_few_films: { eligible: 12 },
    },
  },
  {
    name: 'solo_pick',
    answers: SOLO_PICK_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.soloPick({ room_id: ROOM, title_id: 7 }),
    full: { ok: { title_id: 7 }, closed: { state: 'done' } },
  },
  {
    name: 'my_films',
    answers: MY_FILMS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.myFilms({ segment: 'liked' }),
    full: { ok: { films: [], next_cursor: null } },
  },
  {
    name: 'my_film_card',
    answers: MY_FILM_CARD_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.myFilmCard({ title_id: 7 }),
    full: { ok: { card: CARD, seen: false, liked: true } },
  },
  {
    name: 'set_film_seen',
    answers: SET_FILM_SEEN_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.setFilmSeen({ title_id: 7, seen: true }),
    full: {},
  },
  {
    name: 'remove_my_film',
    answers: REMOVE_MY_FILM_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.removeMyFilm({ title_id: 7 }),
    full: {},
  },
  {
    name: 'title_cards',
    answers: TITLE_CARDS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.titleCards({ room_id: ROOM, title_ids: [1] }),
    full: { ok: { cards: [] }, too_many: { max: 50 } },
  },
  {
    name: 'cast_vote',
    answers: CAST_VOTE_ANSWERS,
    call: (a: ReturnType<typeof createApi>) =>
      a.castVote({ room_id: ROOM, title_id: 7, answer: 'like' }),
    full: { ok: { match: false, state: 'done' }, closed: { state: 'finale' } },
  },
  {
    name: 'cast_ballot',
    answers: CAST_BALLOT_ANSWERS,
    call: (a: ReturnType<typeof createApi>) =>
      a.castBallot({ round_id: ROOM, ranking: [1, 2, 3], veto: 4 }),
    full: { ok: { locked: [MEMBER], of: 3 } },
  },
  {
    name: 'close_round_stage',
    answers: CLOSE_ROUND_STAGE_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.closeRoundStage({ round_id: ROOM }),
    full: {
      ok: { winner_title_id: 7 },
      closed: { winner_title_id: 7 },
      not_yet: { closes_at: '2026-11-04T20:00:00Z' },
    },
  },
  {
    name: 'round_progress',
    answers: ROUND_PROGRESS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.roundProgress({ round_id: ROOM }),
    full: {
      ok: {
        stage: 'vote',
        closes_at: '2026-11-04T20:00:00Z',
        locked: [MEMBER],
        of: 3,
        me_locked: true,
      },
    },
  },
  {
    name: 'request_cards',
    answers: REQUEST_CARDS_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.requestCards({ room_id: ROOM }),
    full: { enough: { remaining: 12 }, closed: { state: 'finale' }, done: { liked: 3 } },
  },
  {
    name: 'undo_last_vote',
    answers: UNDO_LAST_VOTE_ANSWERS,
    call: (a: ReturnType<typeof createApi>) => a.undoLastVote({ room_id: ROOM }),
    full: { ok: { title_id: 7 } },
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

  it('export_my_data resolves rate_limited as a value, not an error', async () => {
    const { client, calls } = fake(() => ok({ status: 'rate_limited' }));
    await expect(createApi(client, { validate: true }).exportMyData()).resolves.toEqual({
      status: 'rate_limited',
    });
    expect(calls[0]).toEqual({ fn: 'export_my_data', args: {} });
  });

  it('set_analytics_choice sends the SQL names and resolves invalid as a value', async () => {
    const { client, calls } = fake(() => ok({ status: 'invalid' }));
    await expect(
      createApi(client, { validate: true }).setAnalyticsChoice({ choice: 'detailed', version: '' }),
    ).resolves.toEqual({ status: 'invalid' });
    expect(calls[0]).toEqual({
      fn: 'set_analytics_choice',
      args: { p_choice: 'detailed', p_version: '' },
    });
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

describe('start_game request id', () => {
  it('accepts the number the database sends once a start went through', async () => {
    const { client } = fake(() => ok({ status: 'ok', request_id: 958, started: true, seats: 4 }));
    await expect(
      createApi(client, { validate: true }).startGame({ room_id: ROOM }),
    ).resolves.toMatchObject({ status: 'ok', request_id: 958 });
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
      ends_on_first_match: false,
      sort: 1,
      matches_to_end: 3,
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

describe('my films', () => {
  const tile = {
    title_id: 7,
    title: 'Film Fictif',
    year: 2001,
    poster_path: null,
    is_picked: false,
    is_super_liked: true,
    at: '2026-11-05T10:00:00Z',
  };

  it('my_films sends the segment, the filter, the cursor and the language', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok', films: [tile], next_cursor: '1_2' }));
    const result = await createApi(client, { validate: true }).myFilms({
      segment: 'liked',
      filter: 'solo',
      cursor: '5_6',
      language: 'fr',
    });
    expect(result).toEqual({ status: 'ok', films: [tile], next_cursor: '1_2' });
    expect(calls[0]).toEqual({
      fn: 'my_films',
      args: { p_segment: 'liked', p_filter: 'solo', p_cursor: '5_6', p_language: 'fr' },
    });
  });

  it('my_films defaults to the all filter and the first page', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok', films: [], next_cursor: null }));
    await createApi(client).myFilms({ segment: 'seen' });
    expect(calls[0]).toEqual({
      fn: 'my_films',
      args: { p_segment: 'seen', p_filter: 'all', p_cursor: undefined, p_language: undefined },
    });
  });

  it('my_films rejects a tile with a wrong shape', async () => {
    const { client } = fake(() =>
      ok({ status: 'ok', films: [{ ...tile, is_picked: 'yes' }], next_cursor: null }),
    );
    await expect(
      createApi(client, { validate: true }).myFilms({ segment: 'liked' }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('my_film_card carries seen and liked next to the card', async () => {
    const { client, calls } = fake(() =>
      ok({ status: 'ok', card: CARD, seen: true, liked: false }),
    );
    await expect(
      createApi(client, { validate: true }).myFilmCard({ title_id: 7, language: 'en' }),
    ).resolves.toEqual({ status: 'ok', card: CARD, seen: true, liked: false });
    expect(calls[0]).toEqual({ fn: 'my_film_card', args: { p_title_id: 7, p_language: 'en' } });
  });

  it('set_film_seen and remove_my_film send the film and resolve not_found as a value', async () => {
    const { client, calls } = fake(() => ok({ status: 'not_found' }));
    const api = createApi(client, { validate: true });
    await expect(api.setFilmSeen({ title_id: 7, seen: false })).resolves.toEqual({
      status: 'not_found',
    });
    await expect(api.removeMyFilm({ title_id: 7 })).resolves.toEqual({ status: 'not_found' });
    expect(calls).toEqual([
      { fn: 'set_film_seen', args: { p_title_id: 7, p_seen: false } },
      { fn: 'remove_my_film', args: { p_title_id: 7 } },
    ]);
  });
});

describe('my_next_cards', () => {
  const card = {
    title_id: 1,
    tmdb_id: 60000001,
    title: 'Film Fictif',
    overview: null,
    year: 2001,
    runtime_min: 100,
    genre_ids: [18],
    tmdb_score: 7.5,
    tmdb_votes: 1000,
    poster_path: '/p.jpg',
    poster_placeholder: null,
    backdrop_path: '/b.jpg',
    trailer_key: null,
    directors: ['Dora Director'],
    cast: ['Alma Actor'],
    providers: [{ provider_id: 8, kind: 'subscription', name: 'Service', logo_path: null }],
    watch_link: null,
    deck_source: 'opening',
    reason_code: null,
    reason_params: {},
    member_ratings: [{ member_id: MEMBER, rating: 4.5 }],
  };

  it('a sample card parses and the arguments are mapped', async () => {
    const { client, calls } = fake(() => ok([card]));
    const cards = await createApi(client, { validate: true }).myNextCards({
      room_id: ROOM,
      limit: 5,
    });
    expect(cards).toEqual([card]);
    expect(calls[0]).toEqual({
      fn: 'my_next_cards',
      args: { p_room_id: ROOM, p_limit: 5, p_member_id: undefined, p_language: undefined },
    });
  });

  it('title_cards sends the room, the films and the language', async () => {
    const { deck_source, reason_code, reason_params, member_ratings, ...plain } = card;
    void [deck_source, reason_code, reason_params, member_ratings];
    const { client, calls } = fake(() => ok({ status: 'ok', cards: [plain] }));
    const result = await createApi(client, { validate: true }).titleCards({
      room_id: ROOM,
      title_ids: [7, 3],
      language: 'fr',
    });
    expect(result).toEqual({ status: 'ok', cards: [plain] });
    expect(calls[0]).toEqual({
      fn: 'title_cards',
      args: { p_room_id: ROOM, p_title_ids: [7, 3], p_language: 'fr' },
    });
  });

  it('title_cards rejects as denied when the caller has no seat', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'no', code: '42501' } }));
    await expect(
      createApi(client).titleCards({ room_id: ROOM, title_ids: [1] }),
    ).rejects.toMatchObject({ kind: 'denied' });
  });

  it('an empty array is a removed seat, not an error', async () => {
    const { client } = fake(() => ok([]));
    await expect(
      createApi(client, { validate: true }).myNextCards({ room_id: ROOM }),
    ).resolves.toEqual([]);
  });

  it('a card missing a key is unexpected when checks are on', async () => {
    const { backdrop_path: _backdrop, ...incomplete } = card;
    const { client } = fake(() => ok([incomplete]));
    await expect(
      createApi(client, { validate: true }).myNextCards({ room_id: ROOM }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('a database error rejects', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'boom', code: '42501' } }));
    await expect(createApi(client).myNextCards({ room_id: ROOM })).rejects.toMatchObject({
      kind: 'denied',
    });
  });
});

describe('swiping', () => {
  it('cast_vote sends the SQL parameter names and leaves unset ones out', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok', match: false }));
    await createApi(client, { validate: true }).castVote({
      room_id: ROOM,
      title_id: 7,
      answer: 'super_like',
      member_id: MEMBER,
      dwell_ms: 900,
      client_at: '2026-11-04T10:00:00Z',
    });
    await createApi(client).castVote({ room_id: ROOM, title_id: 8, answer: 'nope' });
    expect(calls[0]).toEqual({
      fn: 'cast_vote',
      args: {
        p_room_id: ROOM,
        p_title_id: 7,
        p_answer: 'super_like',
        p_member_id: MEMBER,
        p_dwell_ms: 900,
        p_client_at: '2026-11-04T10:00:00Z',
      },
    });
    expect(calls[1]?.args).toMatchObject({ p_member_id: undefined, p_dwell_ms: undefined });
  });

  it('cast_vote sends flipped as p_flipped, and leaves it out when unset', async () => {
    const { client, calls } = fake(() => ok({ status: 'ok', match: false }));
    const api = createApi(client);
    await api.castVote({ room_id: ROOM, title_id: 7, answer: 'like', flipped: true });
    await api.castVote({ room_id: ROOM, title_id: 8, answer: 'like', flipped: false });
    await api.castVote({ room_id: ROOM, title_id: 9, answer: 'like' });
    expect(calls[0]?.args).toMatchObject({ p_flipped: true });
    expect(calls[1]?.args).toMatchObject({ p_flipped: false });
    expect(calls[2]?.args).toMatchObject({ p_flipped: undefined });
  });

  it('cast_vote reads a match and a finale', async () => {
    const answer = {
      status: 'ok',
      match: true,
      kind: 'unanimous',
      decided: true,
      finale_round_id: 'r1',
    };
    const { client } = fake(() => ok(answer));
    await expect(
      createApi(client, { validate: true }).castVote({
        room_id: ROOM,
        title_id: 1,
        answer: 'like',
      }),
    ).resolves.toEqual(answer);
  });

  it('cast_vote with a wrong shape is unexpected when checks are on', async () => {
    const { client } = fake(() => ok({ status: 'ok' }));
    await expect(
      createApi(client, { validate: true }).castVote({
        room_id: ROOM,
        title_id: 1,
        answer: 'like',
      }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('cast_vote keeps the database code of a card that was not dealt', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'no', code: '22023' } }));
    await expect(
      createApi(client).castVote({ room_id: ROOM, title_id: 1, answer: 'like' }),
    ).rejects.toMatchObject({ kind: 'unexpected', code: '22023' });
  });

  it('cast_vote, request_cards and undo_last_vote reject an unknown status', async () => {
    const { client } = fake(() => ok({ status: 'maybe' }));
    const api = createApi(client);
    await expect(
      api.castVote({ room_id: ROOM, title_id: 1, answer: 'like' }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
    await expect(api.requestCards({ room_id: ROOM })).rejects.toMatchObject({ kind: 'unexpected' });
    await expect(api.undoLastVote({ room_id: ROOM })).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('request_cards and undo_last_vote send p_room_id and p_member_id', async () => {
    const { client, calls } = fake(() => ok({ status: 'queued' }));
    await createApi(client).requestCards({ room_id: ROOM, member_id: MEMBER });
    await createApi(fake(() => ok({ status: 'closed' })).client).undoLastVote({ room_id: ROOM });
    expect(calls[0]).toEqual({
      fn: 'request_cards',
      args: { p_room_id: ROOM, p_member_id: MEMBER },
    });
  });

  it("room_matches reads the room's rows and rejects a wrong shape", async () => {
    const row = {
      room_id: ROOM,
      title_id: 7,
      kind: 'majority',
      like_count: 2,
      present_count: 3,
      pick_order: null,
      created_at: '2026-11-04T10:00:00Z',
    };
    const { client, calls } = fake(() => ok([row]));
    await expect(
      createApi(client, { validate: true }).roomMatches({ room_id: ROOM }),
    ).resolves.toEqual([row]);
    expect(calls[0]).toEqual({ fn: 'room_matches.eq', args: ['room_id', ROOM] });
    await expect(
      createApi(fake(() => ok([{ ...row, kind: 'x' }])).client, { validate: true }).roomMatches({
        room_id: ROOM,
      }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
    await expect(
      createApi(fake(() => ok([])).client).roomMatches({ room_id: ROOM }),
    ).resolves.toEqual([]);
  });

  it("rounds reads the room's rounds in order and rejects a wrong shape", async () => {
    const row = {
      id: 'r-1',
      room_id: ROOM,
      seq: 1,
      kind: 'final_cut',
      stage: 'closed',
      stage_closes_at: '2026-11-04T10:01:00Z',
      opened_at: '2026-11-04T10:00:00Z',
      closed_at: '2026-11-04T10:01:00Z',
      winner_title_id: 7,
    };
    const { client, calls } = fake(() => ok([row]));
    await expect(createApi(client, { validate: true }).rounds({ room_id: ROOM })).resolves.toEqual([
      row,
    ]);
    expect(calls[0]).toEqual({ fn: 'rounds.eq', args: ['room_id', ROOM] });
    await expect(
      createApi(fake(() => ok([{ ...row, stage: 'x' }])).client, { validate: true }).rounds({
        room_id: ROOM,
      }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
    await expect(createApi(fake(() => ok([])).client).rounds({ room_id: ROOM })).resolves.toEqual(
      [],
    );
  });

  it("round_candidates reads a round's finalists by seed and rejects a wrong shape", async () => {
    const row = { round_id: 'r-1', title_id: 7, seed: 1, points: 0, vetoed: false };
    const { client, calls } = fake(() => ok([row]));
    await expect(
      createApi(client, { validate: true }).roundCandidates({ round_id: 'r-1' }),
    ).resolves.toEqual([row]);
    expect(calls[0]).toEqual({ fn: 'round_candidates.eq', args: ['round_id', 'r-1'] });
    await expect(
      createApi(fake(() => ok([{ ...row, seed: 'x' }])).client, {
        validate: true,
      }).roundCandidates({ round_id: 'r-1' }),
    ).rejects.toMatchObject({ kind: 'unexpected' });
  });
});

describe('avatars', () => {
  it('pins the six preset keys, in order', () => {
    expect(AVATAR_KEYS).toEqual(['blue', 'green', 'gold', 'red', 'violet', 'teal']);
  });
});

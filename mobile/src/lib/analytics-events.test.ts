import {
  ANALYTICS_EVENTS,
  countBucket,
  createAnalytics,
  gamesPlayedBucket,
  type AnalyticsEvent,
  type Client,
} from './analytics-core';

// The first release's events: the list, what they carry, and the rules around them (M9.2).

type Sent = { event: string; props: Record<string, unknown> };

function setup(options: { choice?: 'on' | 'off' | 'detailed'; dev?: boolean } = {}) {
  const sent: Sent[] = [];
  const identifies: { id: string; props?: Record<string, unknown> }[] = [];
  let now = Date.UTC(2026, 10, 5);
  const client: Client = {
    identify: (id, props) => void identifies.push({ id, props }),
    reset: () => undefined,
    optOut: () => undefined,
    optIn: () => undefined,
    capture: (event, props) => void sent.push({ event, props: props ?? {} }),
    screen: () => undefined,
    shutdown: () => undefined,
  };
  const kv = new Map<string, string>();
  const analytics = createAnalytics({
    key: 'phc_test',
    createClient: () => client,
    store: {
      get: (k) => kv.get(k) ?? null,
      set: (k, v) => void kv.set(k, v),
      remove: (k) => void kv.delete(k),
    },
    now: () => now,
    dev: options.dev ?? false,
  });
  analytics.configure({
    choice: options.choice ?? 'on',
    region: { deviceRegion: 'FR', profileCountry: 'FR' },
    profileId: 'p1',
  });
  return { analytics, sent, identifies, advance: (ms: number) => void (now += ms) };
}

describe('the first release list', () => {
  it('holds exactly the first release events, the solo ones and the screen view', () => {
    expect(Object.keys(ANALYTICS_EVENTS).sort()).toEqual(
      [
        '$screen',
        'error:view',
        'game:first_card_view',
        'game:hint_show',
        'game:nothing_left_view',
        'join:attempt_finish',
        'join:code_submit',
        'join:link_open',
        'lobby:services_submit',
        'my_films:grid_view',
        'onboarding:name_submit',
        'room:create_finish',
        'room:invite_share',
        'solo:cap_show',
        'solo:checkpoint_view',
        'solo:pick_submit',
        'solo:session_start',
        'winner:view',
        'winner:watch_page_open',
      ].sort(),
    );
  });

  it('names follow category:object_action with the fixed verbs', () => {
    const verbs = 'open view show tap start finish skip submit share accept dismiss answer'.split(
      ' ',
    );
    for (const name of Object.keys(ANALYTICS_EVENTS)) {
      if (name === '$screen') continue;
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*:[a-z]+(_[a-z]+)*$/);
      expect(verbs).toContain(name.split(':')[1]?.split('_').pop());
    }
  });

  it('refuses at compile time an unknown name, an unknown property and free text', () => {
    const { analytics } = setup({ dev: true });
    // @ts-expect-error not an event
    expect(() => analytics.track('join:oops')).toThrow();
    // @ts-expect-error a name is free text
    expect(() => analytics.track('join:code_submit', { via: 'Léa' })).toThrow('allowed values');
    // @ts-expect-error not a property of this event
    expect(() => analytics.track('winner:watch_page_open', { title: 'Heat' })).toThrow();
    // @ts-expect-error a required property is missing
    analytics.track('join:code_submit');
  });
});

describe('what an event carries', () => {
  it('adds the registered properties to every event', () => {
    const t = setup();
    t.analytics.setRegistered({
      language: 'fr',
      country: 'FR',
      has_account: false,
      has_letterboxd: false,
      games_played: '2_4',
    });
    t.analytics.track('join:link_open', { has_room_ref: true });
    expect(t.sent).toEqual([
      {
        event: 'join:link_open',
        props: {
          has_room_ref: true,
          language: 'fr',
          country: 'FR',
          has_account: false,
          has_letterboxd: false,
          games_played: '2_4',
        },
      },
    ]);
  });

  it('refuses a registered value outside its list', () => {
    const t = setup({ dev: true });
    expect(() => t.analytics.setRegistered({ country: 'France' })).toThrow('country');
  });

  it('sets them on the person only in identified mode', () => {
    const fr = setup();
    fr.analytics.setRegistered({ language: 'en' });
    expect(fr.identifies).toEqual([]);
    const us = setup();
    us.analytics.configure({
      choice: 'on',
      region: { deviceRegion: 'US', profileCountry: 'US' },
      profileId: 'p1',
    });
    us.analytics.setRegistered({ language: 'en' });
    expect(us.identifies.at(-1)).toEqual({ id: 'p1', props: { language: 'en' } });
  });

  it('buckets games played', () => {
    expect([0, 1, 3, 7].map(gamesPlayedBucket)).toEqual(['0', '1', '2_4', '5_plus']);
  });

  it('never carries a uuid, a six-digit code or a link, whatever the event', () => {
    const t = setup();
    t.analytics.setRegistered({ language: 'fr', country: 'FR', games_played: '1' });
    t.analytics.track('onboarding:name_submit', { has_avatar: true, source: 'invite' });
    t.analytics.track('error:view', { code: 'offline', screen: '/room/[id]/lobby' });
    t.analytics.track('game:first_card_view', {
      ms_since_swiping: 1200,
      mode: 'quick_match',
      room_size: '3_4',
    });
    expect(t.sent).toHaveLength(3);
    for (const { props } of t.sent) {
      for (const value of Object.values(props)) {
        const text = String(value);
        expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
        expect(text).not.toMatch(/\b\d{6}\b/);
        expect(text).not.toMatch(/https?:|:\/\//);
      }
    }
  });
});

describe('when nothing is sent', () => {
  const event = 'winner:watch_page_open' satisfies AnalyticsEvent;

  it('sends nothing after the opt-out', () => {
    const t = setup({ choice: 'off' });
    t.analytics.track(event);
    t.analytics.trackWhenRoomKnown('join:code_submit', { via: 'code' });
    t.analytics.setRoomCap(null);
    expect(t.sent).toEqual([]);
  });

  it('sends nothing in a room capped under 13', () => {
    const t = setup();
    t.analytics.setRoomCap(12);
    t.analytics.track(event);
    expect(t.sent).toEqual([]);
  });

  it('holds an event about a room not entered yet, and sends it when the room is open', () => {
    const t = setup();
    t.analytics.trackWhenRoomKnown('join:attempt_finish', { via: 'code', status: 'ok' });
    expect(t.sent).toEqual([]);
    t.analytics.setRoomCap('unknown');
    expect(t.sent).toEqual([]);
    t.analytics.setRoomCap(null);
    expect(t.sent.map((s) => s.event)).toEqual(['join:attempt_finish']);
  });

  it('waits for the new room even when the phone sits in an open room already', () => {
    const t = setup();
    t.analytics.setRoomCap(null);
    t.analytics.trackWhenRoomKnown('join:attempt_finish', { via: 'link', status: 'ok' });
    expect(t.sent).toEqual([]);
    t.analytics.setRoomCap('unknown');
    t.analytics.setRoomCap(12);
    expect(t.sent).toEqual([]);
  });

  it('drops a held event when the room turns out capped', () => {
    const t = setup();
    t.analytics.trackWhenRoomKnown('join:attempt_finish', { via: 'link', status: 'ok' });
    t.analytics.setRoomCap(12);
    t.analytics.setRoomCap(null);
    expect(t.sent).toEqual([]);
  });

  it('drops a held event whose room never reported', () => {
    const t = setup();
    t.analytics.trackWhenRoomKnown('join:attempt_finish', { via: 'link', status: 'ok' });
    t.advance(60_000);
    t.analytics.setRoomCap(null);
    expect(t.sent).toEqual([]);
  });
});

describe('the solo events', () => {
  it.each([
    [0, '0'],
    [1, '1_4'],
    [4, '1_4'],
    [5, '5_9'],
    [9, '5_9'],
    [10, '10_19'],
    [19, '10_19'],
    [20, '20_plus'],
    [100, '20_plus'],
  ])('buckets %i as %s', (count, bucket) => {
    expect(countBucket(count)).toBe(bucket);
  });

  it('sends each event with exactly its properties', () => {
    const t = setup();
    t.analytics.setRoomCap(null);
    t.analytics.track('solo:checkpoint_view', { card_count: 20, like_count: '5_9' });
    t.analytics.track('solo:pick_submit', { card_count: 40 });
    t.analytics.track('solo:cap_show', { placement: 'deck' });
    t.analytics.track('my_films:grid_view', { segment: 'seen', filter: 'none', film_count: '0' });
    expect(t.sent.map((s) => s.event)).toEqual([
      'solo:checkpoint_view',
      'solo:pick_submit',
      'solo:cap_show',
      'my_films:grid_view',
    ]);
    expect(t.sent[0]?.props).toMatchObject({ card_count: 20, like_count: '5_9' });
    expect(t.sent[3]?.props).toMatchObject({ segment: 'seen', filter: 'none', film_count: '0' });
  });

  it('refuses a misspelt name, an exact count and a film id', () => {
    const { analytics } = setup({ dev: true });
    // @ts-expect-error not an event
    expect(() => analytics.track('solo:pick_submitted', { card_count: 1 })).toThrow();
    const exact = () =>
      // @ts-expect-error a bucket, not a number
      analytics.track('solo:checkpoint_view', { card_count: 20, like_count: 7 });
    expect(exact).toThrow();
    // @ts-expect-error no film id
    expect(() => analytics.track('solo:pick_submit', { card_count: 1, title_id: 3 })).toThrow();
  });

  it('sends nothing from a solo room capped under 13, and sends at 13 or none', () => {
    for (const [cap, sends] of [
      [12, false],
      [13, true],
      [null, true],
    ] as const) {
      const t = setup();
      t.analytics.setRoomCap(cap);
      t.analytics.track('solo:pick_submit', { card_count: 3 });
      expect(t.sent).toHaveLength(sends ? 1 : 0);
    }
  });

  it('holds the session start until the room cap is read, and drops it when capped', () => {
    const open = setup();
    open.analytics.trackWhenRoomKnown('solo:session_start', {
      service_count: 2,
      has_time_budget: false,
    });
    expect(open.sent).toHaveLength(0);
    open.analytics.setRoomCap(null);
    expect(open.sent.map((s) => s.event)).toEqual(['solo:session_start']);

    const kids = setup();
    kids.analytics.trackWhenRoomKnown('solo:session_start', {
      service_count: 2,
      has_time_budget: true,
    });
    kids.analytics.setRoomCap(12);
    expect(kids.sent).toHaveLength(0);
  });

  it('sends nothing after the opt-out', () => {
    const t = setup({ choice: 'off' });
    t.analytics.setRoomCap(null);
    t.analytics.track('my_films:grid_view', {
      segment: 'liked',
      filter: 'all',
      film_count: '20_plus',
    });
    expect(t.sent).toHaveLength(0);
  });
});

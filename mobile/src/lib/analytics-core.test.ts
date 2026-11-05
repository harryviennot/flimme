import { createAnalytics, INSTALL_ID_MONTHS, type Client } from './analytics-core';

function setup(options: { key?: string | null; dev?: boolean; saved?: string } = {}) {
  const calls: string[] = [];
  const created: ('never' | 'identified_only')[] = [];
  const clients: Client[] = [];
  const make = (): Client => {
    const record = (name: string, effect?: (arg?: unknown) => void) =>
      jest.fn((arg?: unknown) => {
        calls.push(arg === undefined ? name : `${name}:${String(arg)}`);
        effect?.(arg);
      });
    return {
      identify: record('identify'),
      reset: record('reset', () => {
        stored.optedOut = false;
      }),
      optOut: record('optOut', () => {
        stored.optedOut = true;
      }),
      optIn: record('optIn', () => {
        stored.optedOut = false;
      }),
      capture: record('capture'),
      screen: record('screen', (name) => {
        if (!stored.optedOut) stored.delivered.push(String(name));
      }),
      shutdown: record('shutdown'),
      setPersistedProperty: record('setPersistedProperty', () => {
        stored.queue = null;
      }),
    };
  };
  // What PostHog keeps in its own storage, across clients and launches.
  const stored = { optedOut: false, queue: ['old'] as string[] | null, delivered: [] as string[] };
  const kv = new Map<string, string>();
  if (options.saved) kv.set('analytics.state', options.saved);
  let now = Date.UTC(2026, 10, 5);
  const analytics = createAnalytics({
    key: options.key === undefined ? 'phc_test' : options.key,
    createClient: (_key, profiles) => {
      created.push(profiles);
      const client = make();
      clients.push(client);
      return client;
    },
    store: {
      get: (k) => kv.get(k) ?? null,
      set: (k, v) => void kv.set(k, v),
      remove: (k) => void kv.delete(k),
    },
    now: () => now,
    dev: options.dev ?? false,
  });
  return {
    analytics,
    calls,
    created,
    kv,
    stored,
    advance: (ms: number) => {
      now += ms;
    },
    setNow: (value: number) => {
      now = value;
    },
  };
}

const sent = (calls: string[]) =>
  calls.filter((c) => c.startsWith('screen:') || c.startsWith('capture:'));

describe('the mode by region', () => {
  it('is anonymous in France: never profiles, no identify', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    t.analytics.setProfileId('p1');
    t.analytics.applyChoice('on');
    expect(t.analytics.getMode()).toBe('anonymous');
    expect(t.created).toEqual(['never']);
    expect(t.calls.some((c) => c.startsWith('identify'))).toBe(false);
  });

  it('is identified in the US: identify once with the profile id', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.applyChoice('on');
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    expect(t.analytics.getMode()).toBe('identified');
    expect(t.created).toEqual(['identified_only']);
    expect(t.calls.filter((c) => c === 'identify:p1')).toHaveLength(1);
  });

  it('is anonymous when the device is in the US and the profile in France, or has no country', () => {
    for (const profileCountry of ['FR', null]) {
      const t = setup();
      t.analytics.setRegion({ deviceRegion: 'US', profileCountry });
      t.analytics.setProfileId('p1');
      expect(t.analytics.getMode()).toBe('anonymous');
      expect(t.calls.some((c) => c.startsWith('identify'))).toBe(false);
    }
  });

  it.each(['NO', 'GB', 'CH', 'IS'])('is anonymous in %s', (code) => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: code, profileCountry: code });
    t.analytics.setProfileId('p1');
    expect(t.analytics.getMode()).toBe('anonymous');
  });
});

describe('the choice', () => {
  it('off opts out and resets, sends nothing, and on resumes', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.screen('/home');
    expect(sent(t.calls)).toEqual(['screen:/home']);

    t.analytics.applyChoice('off');
    expect(t.calls.slice(-2)).toEqual(['reset', 'optOut']);
    t.analytics.screen('/settings');
    t.analytics.track('$screen');
    expect(sent(t.calls)).toEqual(['screen:/home']);

    t.analytics.applyChoice('on');
    expect(t.calls).toContain('optIn');
    t.analytics.screen('/settings');
    expect(sent(t.calls)).toEqual(['screen:/home', 'screen:/settings']);
  });

  it('detailed in France identifies, and back to on resets without identifying again', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    t.analytics.setProfileId('p1');
    t.analytics.applyChoice('on');
    expect(t.calls.some((c) => c.startsWith('identify'))).toBe(false);

    t.analytics.applyChoice('detailed');
    expect(t.created).toEqual(['never', 'identified_only']);
    expect(t.calls.slice(-2)).toEqual(['reset', 'identify:p1']);

    const before = t.calls.length;
    t.analytics.applyChoice('on');
    expect(t.created).toEqual(['never', 'identified_only', 'never']);
    expect(t.calls.slice(before)).toContain('reset');
    expect(t.calls.slice(before).some((c) => c.startsWith('identify'))).toBe(false);
  });

  it('reads detailed as identified outside strict regions', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.applyChoice('detailed');
    expect(t.analytics.getMode()).toBe('identified');
  });

  it('resets when a launch finds another mode than the one it last ran in', () => {
    const t = setup({
      saved: JSON.stringify({ mode: 'identified', since: Date.UTC(2026, 10, 1) }),
    });
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    expect(t.calls).toContain('reset');
  });
});

describe('the kids rule', () => {
  function inRoom(cap: number | null | 'unknown') {
    const t = setup({ dev: true });
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.setRoomCap(cap);
    return t;
  }

  it('sends nothing in a room capped at 12, and resumes after leaving', () => {
    const t = inRoom(12);
    t.analytics.screen('/room/[id]/lobby');
    t.analytics.screen('/room/[id]/swipe');
    expect(sent(t.calls)).toEqual([]);
    expect(t.analytics.getEntries().filter((e) => e.kind === 'dropped')).toHaveLength(2);

    t.analytics.clearRoomCap();
    t.analytics.screen('/home');
    expect(sent(t.calls)).toEqual(['screen:/home']);
  });

  it.each([13, 18, null])('sends in a room with a cap of %s', (cap) => {
    const t = inRoom(cap);
    t.analytics.screen('/room/[id]/lobby');
    expect(sent(t.calls)).toEqual(['screen:/room/[id]/lobby']);
  });

  it('sends nothing while the room is not read yet, or before its layout reported it', () => {
    const t = inRoom('unknown');
    t.analytics.screen('/room/[id]/lobby');
    t.analytics.clearRoomCap();
    t.analytics.screen('/room/[id]/lobby');
    expect(sent(t.calls)).toEqual([]);
  });
});

describe('a screen seen before the room is read', () => {
  it('is sent when the room turns out open, and dropped when it is capped', () => {
    const open = setup();
    open.analytics.configure({
      choice: 'on',
      region: { deviceRegion: 'US', profileCountry: 'US' },
      profileId: 'p1',
    });
    open.analytics.screen('/room/[id]/lobby');
    open.analytics.setRoomCap('unknown');
    expect(sent(open.calls)).toEqual([]);
    open.analytics.setRoomCap(null);
    expect(sent(open.calls)).toEqual(['screen:/room/[id]/lobby']);

    const capped = setup();
    capped.analytics.configure({
      choice: 'on',
      region: { deviceRegion: 'US', profileCountry: 'US' },
      profileId: 'p1',
    });
    capped.analytics.setRoomCap('unknown');
    capped.analytics.screen('/room/[id]/lobby');
    capped.analytics.setRoomCap(10);
    capped.analytics.clearRoomCap();
    expect(sent(capped.calls)).toEqual([]);
  });
});

describe('the install id', () => {
  it('resets once when it is older than 13 months, then not again', () => {
    const since = Date.UTC(2025, 9, 1);
    const t = setup({ saved: JSON.stringify({ mode: 'anonymous', since }) });
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    expect(t.calls.filter((c) => c === 'reset')).toHaveLength(1);
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    expect(t.calls.filter((c) => c === 'reset')).toHaveLength(1);
    expect(JSON.parse(t.kv.get('analytics.state') ?? '{}').since).toBe(Date.UTC(2026, 10, 5));
  });

  it('keeps a younger id, and the age is not extended by visits', () => {
    expect(INSTALL_ID_MONTHS).toBe(13);
    const t = setup({ saved: JSON.stringify({ mode: 'anonymous', since: Date.UTC(2025, 11, 1) }) });
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    expect(t.calls).not.toContain('reset');
    t.setNow(Date.UTC(2027, 0, 5));
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    expect(t.calls.filter((c) => c === 'reset')).toHaveLength(1);
  });
});

describe('no key', () => {
  it('creates no client and sends nothing, and the dev log records the events', () => {
    const t = setup({ key: null, dev: true });
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    t.analytics.setProfileId('p1');
    t.analytics.screen('/home');
    expect(t.created).toEqual([]);
    expect(t.calls).toEqual([]);
    const events = t.analytics.getEntries().filter((e) => e.kind === 'event');
    expect(events).toEqual([
      expect.objectContaining({ name: '$screen', mode: 'anonymous', props: { screen: '/home' } }),
    ]);
  });

  it('records nothing in a production build', () => {
    const t = setup({ key: null, dev: false });
    t.analytics.setRegion({ deviceRegion: 'FR', profileCountry: 'FR' });
    t.analytics.screen('/home');
    expect(t.analytics.getEntries()).toEqual([]);
  });
});

describe('what an event may carry', () => {
  it('refuses a route that holds a code or an id, and unknown properties, in dev', () => {
    const t = setup({ dev: true });
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    expect(() => t.analytics.screen('/join/482913')).toThrow('route pattern');
    expect(() => t.analytics.screen('/room/3f2c0b1e-aaaa/lobby')).toThrow('route pattern');
    // @ts-expect-error an unknown property doesn't compile
    expect(() => t.analytics.track('$screen', { name: 'Léa' })).toThrow('unknown property');
    expect(sent(t.calls)).toEqual([]);
  });

  it('drops them quietly in a production build', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    expect(() => t.analytics.screen('/join/482913')).not.toThrow();
    expect(sent(t.calls)).toEqual([]);
  });

  it('accepts the route patterns', () => {
    const t = setup({ dev: true });
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.screen('/join/[code]');
    t.analytics.screen('/');
    expect(sent(t.calls)).toEqual(['screen:/join/[code]', 'screen:/']);
  });
});

describe('forget, after a deletion', () => {
  it('resets, opts out and stops the client, and nothing re-creates the person', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.forget();
    expect(t.calls.slice(-4)).toEqual([
      'setPersistedProperty:queue',
      'reset',
      'optOut',
      'shutdown',
    ]);
    expect(t.stored.queue).toBeNull();

    t.analytics.applyChoice('on');
    t.analytics.setProfileId('p1');
    t.analytics.screen('/home');
    expect(t.created).toHaveLength(1);
    expect(sent(t.calls)).toEqual([]);
    expect(t.kv.has('analytics.state')).toBe(false);
  });

  it('resumes when a new guest has another profile id', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.forget();
    t.analytics.setProfileId('p2');
    t.analytics.screen('/home');
    expect(t.created).toHaveLength(2);
    expect(t.calls).toContain('identify:p2');
    expect(sent(t.calls)).toEqual(['screen:/home']);
  });

  it('reaches PostHog again for the new guest, though the opt-out is kept by PostHog itself', () => {
    const t = setup();
    t.analytics.setRegion({ deviceRegion: 'US', profileCountry: 'US' });
    t.analytics.setProfileId('p1');
    t.analytics.forget();
    expect(t.stored.optedOut).toBe(true);
    t.analytics.setProfileId('p2');
    t.analytics.screen('/home');
    expect(t.stored.optedOut).toBe(false);
    expect(t.stored.delivered).toEqual(['/home']);
  });
});

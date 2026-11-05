import type { AnalyticsChoice } from '@flimme/contract';

import {
  isStrictFor,
  resolveMode,
  type AnalyticsMode,
  type RegionInputs,
} from './analytics-region';

// Product analytics (analytics.md, app-structure.md#analytics-and-crash-reports). Screens call
// `track` and `screen`, never the vendor. The wrapper decides what runs: nothing when the player
// opted out, an anonymous install id in strict regions, the profile id elsewhere or after the
// player chose detailed stats, and nothing at all while the phone is in a room capped under 13.

export const ANALYTICS_HOST = 'https://eu.i.posthog.com';
/** An anonymous install id lives 13 months, not extended on each visit (privacy.md). */
export const INSTALL_ID_MONTHS = 13;
export const KIDS_AGE = 13;
const STATE_KEY = 'analytics.state';

/**
 * The events and the only values their properties may take. A string property is a closed list
 * (never a name, a code or a title); a number or a boolean is checked by its type. M9.2 adds the
 * rest of the first release's events here. `$screen` carries the route pattern and no property.
 */
export const ANALYTICS_EVENTS = {
  $screen: {},
} as const satisfies Record<string, Record<string, readonly string[] | 'number' | 'boolean'>>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsProps = Record<string, string | number | boolean>;

/** What the phone is in: no room, a room with its cap (null: none), or a room not read yet. */
export type RoomCap = number | null | 'unknown';

export type LogEntry = {
  id: number;
  kind: 'event' | 'call' | 'dropped';
  name: string;
  mode: AnalyticsMode;
  props?: AnalyticsProps;
  reason?: string;
};

export type Client = {
  identify(distinctId: string): unknown;
  reset(): unknown;
  optOut(): unknown;
  optIn(): unknown;
  capture(event: string, properties?: AnalyticsProps): unknown;
  screen(name: string, properties?: AnalyticsProps): unknown;
  shutdown(): unknown;
  /** PostHog's own storage; used to empty the unsent queue after a deletion. */
  setPersistedProperty?(key: string, value: null): unknown;
};

type Store = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export type AnalyticsDeps = {
  /** The PostHog project key. Empty or missing: no client exists and nothing is sent. */
  key: string | null;
  createClient: (key: string, personProfiles: 'never' | 'identified_only') => Client;
  store: Store;
  now: () => number;
  /** Development builds record what they would send, and refuse a bad property by throwing. */
  dev: boolean;
};

type Saved = { mode: AnalyticsMode; since: number };

// Route names are letters and hyphens only; anything else in a path (a code, an id) is a value.
const SCREEN_PATTERN = /^(\/|(\/([a-z-]+|\[[a-zA-Z]+\]))+)$/;

function addMonths(time: number, months: number): number {
  const date = new Date(time);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

function checkProps(event: AnalyticsEvent, props: AnalyticsProps | undefined): string | null {
  const allowed: Record<string, readonly string[] | 'number' | 'boolean'> = ANALYTICS_EVENTS[event];
  for (const [name, value] of Object.entries(props ?? {})) {
    const rule = allowed[name];
    if (rule === undefined) return `${event}: unknown property ${name}`;
    if (rule === 'number' || rule === 'boolean') {
      if (typeof value !== rule) return `${event}.${name} must be a ${rule}`;
    } else if (typeof value !== 'string' || !rule.includes(value)) {
      return `${event}.${name} is not one of its allowed values`;
    }
  }
  return null;
}

export function createAnalytics(deps: AnalyticsDeps) {
  let choice: AnalyticsChoice = 'on';
  let region: RegionInputs = { deviceRegion: null, profileCountry: null };
  let profileId: string | null = null;
  let room: RoomCap | undefined;
  let forgottenFor: { id: string | null } | null = null;
  // The one screen seen while the room's cap was not known yet: sent if the room turns out open,
  // dropped if it is capped. Nothing else is ever held.
  let waitingScreen: string | null = null;

  let client: Client | null = null;
  let clientProfiles: 'never' | 'identified_only' | null = null;
  let mode: AnalyticsMode = 'off';
  let identifiedAs: string | null = null;

  let entries: LogEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();
  let snapshot: { entries: LogEntry[]; mode: AnalyticsMode } = { entries, mode };
  const notify = () => {
    snapshot = { entries, mode };
    listeners.forEach((listener) => listener());
  };

  function log(entry: Omit<LogEntry, 'id' | 'mode'>) {
    if (!deps.dev) return;
    entries = [...entries.slice(-199), { ...entry, id: nextId++, mode }];
    notify();
  }

  function call(name: string, run: (client: Client) => unknown) {
    log({ kind: 'call', name });
    if (client) void Promise.resolve(run(client)).catch(() => undefined);
  }

  function read(): Saved | null {
    try {
      const saved = JSON.parse(deps.store.get(STATE_KEY) ?? 'null') as Saved | null;
      return saved && typeof saved.since === 'number' ? saved : null;
    } catch {
      return null;
    }
  }

  function write(next: Saved) {
    deps.store.set(STATE_KEY, JSON.stringify(next));
  }

  function ensureClient(profiles: 'never' | 'identified_only') {
    if (client && clientProfiles === profiles) return;
    if (client) {
      const old = client;
      void Promise.resolve(old.shutdown()).catch(() => undefined);
      client = null;
    }
    if (!deps.key) return;
    client = deps.createClient(deps.key, profiles);
    clientProfiles = profiles;
  }

  function apply() {
    applyNow();
    if (deps.dev) notify();
  }

  function applyNow() {
    const next: AnalyticsMode = forgottenFor ? 'off' : resolveMode(choice, isStrictFor(region));
    const saved = read();
    const before = saved?.mode ?? null;
    const now = deps.now();
    mode = next;
    // After a deletion the client is gone and stays gone (forget).
    if (forgottenFor) return;

    if (next === 'off') {
      if (before !== 'off') {
        ensureClient(clientProfiles ?? 'never');
        // `reset` first: it also clears the opt-out flag, so the opt-out comes last.
        call('reset', (c) => c.reset());
        call('optOut', (c) => c.optOut());
        identifiedAs = null;
        write({ mode: 'off', since: now });
      }
      return;
    }

    ensureClient(next === 'identified' ? 'identified_only' : 'never');
    let since = saved?.since ?? now;
    if (before === 'off' || before === null) {
      // The opt-out is kept by PostHog across launches and clients, and only `optIn` lifts it. A
      // first run, or a new guest after a deletion, has nothing saved here but may still hold it.
      call('optIn', (c) => c.optIn());
    } else if (before !== null && before !== next) {
      // Anonymous to identified or back starts a new identity, with no merge (analytics.md#identity).
      call('reset', (c) => c.reset());
      identifiedAs = null;
      since = now;
    }
    if (next === 'anonymous' && addMonths(since, INSTALL_ID_MONTHS) <= now) {
      call('reset', (c) => c.reset());
      since = now;
    }
    if (next === 'identified' && profileId && identifiedAs !== profileId) {
      if (identifiedAs) call('reset', (c) => c.reset());
      const id = profileId;
      call('identify', (c) => c.identify(id));
      identifiedAs = profileId;
    }
    if (before !== next || saved?.since !== since) write({ mode: next, since });
  }

  function blockedReason(pattern?: string): string | null {
    if (forgottenFor) return 'forgotten';
    if (mode === 'off') return 'opted out';
    if (room === 'unknown' || (typeof room === 'number' && room < KIDS_AGE)) return 'kids room';
    // A room route before its layout reported the room: treated as unknown.
    if (room === undefined && pattern?.startsWith('/room/')) return 'kids room';
    return null;
  }

  const roomUnknown = (pattern?: string) =>
    room === 'unknown' || (room === undefined && !!pattern?.startsWith('/room/'));

  function guard(event: AnalyticsEvent, props?: AnalyticsProps, pattern?: string): boolean {
    const problem = checkProps(event, props);
    if (problem) {
      if (deps.dev) throw new Error(`analytics: ${problem}`);
      return false;
    }
    const reason = blockedReason(pattern);
    if (reason) {
      log({ kind: 'dropped', name: event, reason });
      return false;
    }
    return true;
  }

  function send(pattern: string) {
    log({ kind: 'event', name: '$screen', props: { screen: pattern } });
    if (client) void Promise.resolve(client.screen(pattern)).catch(() => undefined);
  }

  return {
    /**
     * M9.2: an event fired from a room screen relies on the room layout having reported its cap
     * first (effects run child first); `track` has no route to check, unlike `screen`.
     */
    /** Sends an event, unless the player opted out or the phone is in a room capped under 13. */
    track(event: AnalyticsEvent, props?: AnalyticsProps): void {
      if (!guard(event, props)) return;
      log({ kind: 'event', name: event, props });
      if (client) void Promise.resolve(client.capture(event, props)).catch(() => undefined);
    },

    /** A screen view from the route pattern (`/join/[code]`, never the code). */
    screen(pattern: string): void {
      if (!SCREEN_PATTERN.test(pattern)) {
        if (deps.dev) throw new Error(`analytics: not a route pattern: ${pattern}`);
        return;
      }
      if (!guard('$screen', undefined, pattern)) {
        if (roomUnknown(pattern) && mode !== 'off') waitingScreen = pattern;
        return;
      }
      send(pattern);
    },

    /** The room the phone is in: its cap, `null` for none, `'unknown'` until read. */
    setRoomCap(cap: RoomCap): void {
      room = cap;
      const waiting = waitingScreen;
      if (cap === 'unknown') return;
      waitingScreen = null;
      if (waiting && !blockedReason(waiting)) send(waiting);
    },
    /** The phone left every room. */
    clearRoomCap(): void {
      room = undefined;
      waitingScreen = null;
    },

    /** Everything the mode depends on, at once, so a launch applies it a single time. */
    configure(input: { choice: AnalyticsChoice; region: RegionInputs; profileId: string | null }) {
      choice = input.choice;
      region = input.region;
      profileId = input.profileId;
      if (forgottenFor && profileId !== null && profileId !== forgottenFor.id) forgottenFor = null;
      apply();
    },

    applyChoice(next: AnalyticsChoice): void {
      choice = next;
      apply();
    },
    setRegion(next: RegionInputs): void {
      region = next;
      apply();
    },
    /** The profile id; a different one after a deletion lifts `forget`. */
    setProfileId(id: string | null): void {
      profileId = id;
      if (forgottenFor && id !== null && id !== forgottenFor.id) forgottenFor = null;
      apply();
    },

    /** After a deletion: the person is gone server side, so nothing may create it again. */
    forget(): void {
      forgottenFor = { id: profileId };
      waitingScreen = null;
      ensureClient(clientProfiles ?? 'never');
      // Events queued offline carry the deleted person's id: they must never be sent.
      call('clearQueue', (c) => c.setPersistedProperty?.('queue', null));
      call('reset', (c) => c.reset());
      call('optOut', (c) => c.optOut());
      if (client) void Promise.resolve(client.shutdown()).catch(() => undefined);
      client = null;
      clientProfiles = null;
      identifiedAs = null;
      mode = 'off';
      deps.store.remove(STATE_KEY);
    },

    getMode: () => mode,
    getEntries: () => entries,
    getSnapshot: () => snapshot,
    clearLog(): void {
      entries = [];
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

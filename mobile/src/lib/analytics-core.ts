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

type Rule = readonly string[] | 'number' | 'boolean' | 'route' | 'country';

/** How many, in buckets (solo checkpoints and My films): never an exact count. */
export const COUNT_BUCKETS = ['0', '1_4', '5_9', '10_19', '20_plus'] as const;
export type CountBucket = (typeof COUNT_BUCKETS)[number];

export function countBucket(count: number): CountBucket {
  if (count <= 0) return '0';
  if (count < 5) return '1_4';
  if (count < 10) return '5_9';
  return count < 20 ? '10_19' : '20_plus';
}

/**
 * The events and the only values their properties may take (analytics.md#events). A string
 * property is a closed list (never a name, a code or a title); a number or a boolean is checked by
 * its type; `route` is a route pattern. A typo in a name or a property doesn't compile. `$screen`
 * carries the route pattern and no property. Later features add their events here.
 */
export const ANALYTICS_EVENTS = {
  $screen: {},
  'onboarding:name_submit': { has_avatar: 'boolean', source: ['invite', 'organic'] },
  'join:link_open': { has_room_ref: 'boolean' },
  'join:code_submit': { via: ['code', 'qr'] },
  'join:attempt_finish': {
    via: ['link', 'code', 'qr', 'rejoin', 'play_again'],
    status: [
      'ok',
      'not_found',
      'closed',
      'full',
      'starting',
      'in_finale',
      'name_required',
      'rate_limited',
      'locked',
      'removed',
      'unknown',
    ],
  },
  'room:create_finish': {
    mode: ['quick_match'],
    mood_count: 'number',
    has_time_budget: 'boolean',
    seen_rule: ['hide_seen', 'allow_rewatch', 'show_all'],
    quality: ['standard', 'hidden_gems', 'guilty_pleasures'],
    service_count: 'number',
  },
  'room:invite_share': { method: ['share_sheet', 'qr_show', 'code_copy'] },
  'lobby:services_submit': {
    service_count: 'number',
    step: ['room_setup', 'lobby', 'settings'],
  },
  'game:first_card_view': {
    ms_since_swiping: 'number',
    ms_since_link_open: 'number',
    mode: ['quick_match'],
    room_size: ['2', '3_4', '5_10'],
  },
  'game:hint_show': { hint: ['swipe', 'seen_it', 'flip', 'super_like', 'undo'] },
  'game:nothing_left_view': { is_host: 'boolean' },
  'winner:view': { outcome: ['match', 'finale'], room_size: ['2', '3_4', '5_10'] },
  'winner:watch_page_open': {},
  'solo:session_start': { service_count: 'number', has_time_budget: 'boolean' },
  'solo:checkpoint_view': { card_count: 'number', like_count: COUNT_BUCKETS },
  'solo:pick_submit': { card_count: 'number' },
  'solo:cap_show': { placement: ['deck', 'play'] },
  'my_films:grid_view': {
    segment: ['liked', 'seen'],
    filter: ['all', 'friends', 'solo', 'none'],
    film_count: COUNT_BUCKETS,
  },
  'error:view': {
    code: ['room_closed', 'offline', 'reconnecting', 'update_required', 'unexpected'],
    screen: 'route',
  },
} as const satisfies Record<string, Record<string, Rule>>;

/** Properties an event may leave out. */
type OptionalProps = { 'game:first_card_view': 'ms_since_link_open' };

/** Registered on every event, and set on the person in identified mode (analytics.md#events). */
export const REGISTERED_PROPS = {
  language: ['fr', 'en'],
  country: 'country',
  has_account: 'boolean',
  has_letterboxd: 'boolean',
  games_played: ['0', '1', '2_4', '5_plus'],
} as const satisfies Record<string, Rule>;

type ValueOf<R> = R extends readonly (infer V)[]
  ? V
  : R extends 'number'
    ? number
    : R extends 'boolean'
      ? boolean
      : string;
type OptionalOf<E> = E extends keyof OptionalProps ? OptionalProps[E] : never;
type PropsOf<R extends Record<string, Rule>, O extends string> = [keyof R] extends [never]
  ? Record<string, never>
  : { [K in Exclude<keyof R, O>]: ValueOf<R[K]> } & { [K in Extract<keyof R, O>]?: ValueOf<R[K]> };

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;
/** The properties an event takes: required ones as in the list, optional ones marked above. */
export type EventProps<E extends AnalyticsEvent> = PropsOf<
  (typeof ANALYTICS_EVENTS)[E],
  OptionalOf<E>
>;
/** `track`'s second argument: absent for an event with no required property. */
type TrackArgs<E extends AnalyticsEvent> =
  {} extends EventProps<E> ? [props?: EventProps<E>] : [props: EventProps<E>];
export type RegisteredProps = Partial<{
  [K in keyof typeof REGISTERED_PROPS]: ValueOf<(typeof REGISTERED_PROPS)[K]>;
}>;
export type AnalyticsProps = Record<string, string | number | boolean>;

/** The bucket of games this install has seen reach swiping. */
export function gamesPlayedBucket(count: number): '0' | '1' | '2_4' | '5_plus' {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  return count <= 4 ? '2_4' : '5_plus';
}

/** How long an event waits for its room's cap to be read. */
const HOLD_MS = 15_000;

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
  identify(distinctId: string, properties?: AnalyticsProps): unknown;
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

function checkProps(
  event: string,
  allowed: Record<string, Rule>,
  props: AnalyticsProps | undefined,
): string | null {
  for (const [name, value] of Object.entries(props ?? {})) {
    const rule = allowed[name];
    if (rule === undefined) return `${event}: unknown property ${name}`;
    if (rule === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${event}.${name} must be a number`;
      }
    } else if (rule === 'boolean') {
      if (typeof value !== 'boolean') return `${event}.${name} must be a boolean`;
    } else if (rule === 'route') {
      if (typeof value !== 'string' || !SCREEN_PATTERN.test(value)) {
        return `${event}.${name} is not a route pattern`;
      }
    } else if (rule === 'country') {
      if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) {
        return `${event}.${name} is not a country code`;
      }
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
  // Events about a room not entered yet, waiting for its cap (trackWhenRoomKnown).
  let held: { event: AnalyticsEvent; props?: AnalyticsProps; at: number }[] = [];
  let registered: RegisteredProps = {};

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
      const person = { ...registered };
      call('identify', (c) => c.identify(id, person));
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

  function valid(event: AnalyticsEvent, props?: AnalyticsProps): boolean {
    const rules = (ANALYTICS_EVENTS as Record<string, Record<string, Rule> | undefined>)[event];
    const problem = !rules
      ? `unknown event ${event}`
      : (checkProps(event, rules, props) ??
        checkProps('registered', REGISTERED_PROPS as Record<string, Rule>, registered));
    if (problem) {
      if (deps.dev) throw new Error(`analytics: ${problem}`);
      return false;
    }
    return true;
  }

  function guard(event: AnalyticsEvent, props?: AnalyticsProps, pattern?: string): boolean {
    if (!valid(event, props)) return false;
    const reason = blockedReason(pattern);
    if (reason) {
      log({ kind: 'dropped', name: event, reason });
      return false;
    }
    return true;
  }

  function send(pattern: string) {
    log({ kind: 'event', name: '$screen', props: { screen: pattern, ...registered } });
    if (client) {
      void Promise.resolve(client.screen(pattern, { ...registered })).catch(() => undefined);
    }
  }

  function sendEvent(event: AnalyticsEvent, props?: AnalyticsProps) {
    const all = { ...props, ...registered };
    log({ kind: 'event', name: event, props: all });
    if (client) void Promise.resolve(client.capture(event, all)).catch(() => undefined);
  }

  function flushHeld() {
    const now = deps.now();
    const waiting = held;
    held = [];
    for (const item of waiting) {
      if (now - item.at > HOLD_MS) continue;
      const reason = blockedReason();
      if (reason) log({ kind: 'dropped', name: item.event, reason });
      else sendEvent(item.event, item.props);
    }
  }

  return {
    /**
     * Sends an event, unless the player opted out or the phone is in a room capped under 13. An
     * event fired from a room screen relies on the room layout having reported its cap first;
     * `track` has no route to check, unlike `screen`.
     */
    track<E extends AnalyticsEvent>(event: E, ...args: TrackArgs<E>): void {
      const props = args[0] as AnalyticsProps | undefined;
      if (!guard(event, props)) return;
      sendEvent(event, props);
    },

    /**
     * An event about a room the phone is not in yet (a join, a room just opened): sent once the
     * room layout has read the room's cap, dropped if the room is capped under 13 or the cap does
     * not arrive within a few seconds.
     */
    trackWhenRoomKnown<E extends AnalyticsEvent>(event: E, ...args: TrackArgs<E>): void {
      const props = args[0] as AnalyticsProps | undefined;
      if (!valid(event, props)) return;
      if (forgottenFor) {
        log({ kind: 'dropped', name: event, reason: 'forgotten' });
        return;
      }
      // The mode is checked when the event leaves: at a cold start it is not applied yet.
      // Always wait for the next room cap: the phone may be in another room now, whose cap says
      // nothing about the room this event is about.
      held = [...held.slice(-4), { event, props, at: deps.now() }];
    },

    /** The values every event carries (analytics.md#events); set on the person when identified. */
    setRegistered(next: RegisteredProps): void {
      const problem = checkProps('registered', REGISTERED_PROPS as Record<string, Rule>, next);
      if (problem) {
        if (deps.dev) throw new Error(`analytics: ${problem}`);
        return;
      }
      registered = { ...next };
      if (mode === 'identified' && identifiedAs) {
        const id = identifiedAs;
        const person = { ...registered };
        call('identify', (c) => c.identify(id, person));
      }
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
      flushHeld();
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
      held = [];
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

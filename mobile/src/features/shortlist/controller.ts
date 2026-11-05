import { duration } from '@/theme/motion';

// The shortlisted beat's rules without JSX (moments.md#the-shortlisted-beat): it starts on the
// first signal (the phone's own `ok` answer or the `match` event), plays once per film, queues
// when several films match at once, and lands each film in the shortlist. The shortlist is the
// state (what the top bar shows); a beat is the moment that fills it. One controller per room.

/** The poster and its two lines stay still. */
export const BEAT_SHOW_MS = duration['shortlist-hold'];
/** The poster flies to its slot. */
export const BEAT_FLIGHT_MS = duration.slow;
/** The scrim fades out after the landing. */
export const BEAT_TAIL_MS = duration.fast;
/** The room layout never holds its route longer than this (a stuck beat must not trap a player). */
export const HOLD_LIMIT_MS = 3000;
/** The size until the mode or an event says otherwise. */
export const DEFAULT_SIZE = 3;

export type Beat = {
  title_id: number;
  /** "N of size": the shortlist's count, from the event or the phone's own plus one. */
  count: number;
  /** The vote count; null until the event brings it. */
  likes: number | null;
  of: number | null;
};

export type BeatPhase = 'show' | 'fly' | 'tail';

export type ShortlistSnapshot = {
  /** The films in the top bar, in the order they matched. */
  landed: readonly number[];
  /** Films that landed through a beat (their slot pops). */
  fresh: ReadonlySet<number>;
  /** Landed plus films still in a beat: they have left, or are leaving, the phone's stack. */
  known: ReadonlySet<number>;
  size: number;
  beat: Beat | null;
  phase: BeatPhase | null;
  /** Counts up with each beat so the layer starts its animation again. */
  seq: number;
  /** The layer is mounted and the stack takes no input. */
  active: boolean;
  /** The room layout keeps its route where it is. */
  holding: boolean;
};

/** What either signal carries. The phone's own answer has the title and `decided` only. */
export type BeatSignal = {
  title_id: number;
  likes?: number;
  of?: number;
  decided?: boolean;
  shortlisted?: number;
  shortlist_size?: number;
};

export type ShortlistDeps = {
  /** The haptic, once, at the start of each beat. */
  onBeat: (titleId: number) => void;
  /** The event counted more films than the phone knows: read the shortlist again. */
  onMismatch: () => void;
};

export const EMPTY_SNAPSHOT: ShortlistSnapshot = {
  landed: [],
  fresh: new Set(),
  known: new Set(),
  size: DEFAULT_SIZE,
  beat: null,
  phase: null,
  seq: 0,
  active: false,
  holding: false,
};

export function createShortlistController(deps: ShortlistDeps) {
  let landed: number[] = [];
  const fresh = new Set<number>();
  const known = new Set<number>();
  let size = DEFAULT_SIZE;
  let playing: Beat | null = null;
  const queue: Beat[] = [];
  let phase: BeatPhase | null = null;
  let seq = 0;
  let stopped = false;
  let holdExpired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  let snapshot: ShortlistSnapshot = EMPTY_SNAPSHOT;

  const active = () => playing !== null || phase === 'tail';

  function emit() {
    const isActive = active();
    snapshot = {
      landed,
      fresh: new Set(fresh),
      known: new Set(known),
      size,
      beat: playing,
      phase,
      seq,
      active: isActive,
      holding: isActive && !holdExpired,
    };
    listeners.forEach((listener) => listener());
  }

  function startHold() {
    if (holdTimer) return;
    holdExpired = false;
    holdTimer = setTimeout(() => {
      holdExpired = true;
      emit();
    }, HOLD_LIMIT_MS);
  }

  function endHold() {
    clearTimeout(holdTimer);
    holdTimer = undefined;
    holdExpired = false;
  }

  function startNext() {
    clearTimeout(timer);
    const next = queue.shift();
    if (!next) return;
    playing = next;
    phase = 'show';
    seq += 1;
    startHold();
    deps.onBeat(next.title_id);
    timer = setTimeout(fly, BEAT_SHOW_MS);
    emit();
  }

  function fly() {
    phase = 'fly';
    timer = setTimeout(land, BEAT_FLIGHT_MS);
    emit();
  }

  function land() {
    if (playing) {
      landed = [...landed, playing.title_id];
      fresh.add(playing.title_id);
    }
    playing = null;
    if (queue.length > 0) {
      startNext();
      return;
    }
    phase = 'tail';
    timer = setTimeout(end, BEAT_TAIL_MS);
    emit();
  }

  function end() {
    phase = null;
    endHold();
    emit();
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** The phone's own `ok` with `match: true`, or the `match` event. */
    signal(signal: BeatSignal) {
      if (stopped || signal.decided !== false) return;
      if (signal.shortlist_size !== undefined && signal.shortlist_size >= 1) {
        size = signal.shortlist_size;
      }
      const id = signal.title_id;
      const pending = playing?.title_id === id ? playing : queue.find((b) => b.title_id === id);
      if (pending) {
        // The other signal for a beat already under way: correct it in place, no second beat.
        const merged: Beat = {
          ...pending,
          count: signal.shortlisted ?? pending.count,
          likes: pending.likes ?? signal.likes ?? null,
          of: pending.of ?? signal.of ?? null,
        };
        if (playing === pending) playing = merged;
        else queue[queue.indexOf(pending)] = merged;
        emit();
        return;
      }
      if (known.has(id)) return;
      known.add(id);
      if (signal.shortlisted !== undefined && signal.shortlisted !== known.size) deps.onMismatch();
      queue.push({
        title_id: id,
        count: signal.shortlisted ?? known.size,
        likes: signal.likes ?? null,
        of: signal.of ?? null,
      });
      if (playing === null && phase !== 'fly') startNext();
      else emit();
    },

    setSize(next: number) {
      if (stopped || next < 1 || next === size) return;
      size = next;
      emit();
    },

    /** The room's matches were read (cold start, reconnect, foreground): no beat, no animation. */
    readBack(titleIds: readonly number[]) {
      if (stopped) return;
      let changed = false;
      for (const id of titleIds) {
        if (known.has(id)) continue;
        known.add(id);
        landed = [...landed, id];
        changed = true;
      }
      if (changed) emit();
    },

    /** The night's pick arrived: the beat's layer goes at once and the films are in the shortlist. */
    pickArrived() {
      if (!active() && queue.length === 0) return;
      clearTimeout(timer);
      const rest = [...(playing ? [playing] : []), ...queue];
      queue.length = 0;
      landed = [...landed, ...rest.map((b) => b.title_id)];
      playing = null;
      phase = null;
      endHold();
      emit();
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      endHold();
    },
  };
}

export type ShortlistController = ReturnType<typeof createShortlistController>;

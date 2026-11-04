import type { RoomMatch, RoomState } from '@flimme/contract';

import { duration } from '@/theme/motion';

// The match overlay's rules without JSX (match.md, moments.md#the-match): it starts on the
// first signal, plays once per room, and hands over after the hold. One controller per room.

/** A tap before this does not skip, so a gesture already under way can't cut the moment. */
export const SKIP_AFTER_MS = duration.celebrate;
/** About when the avatars have landed: the room is marked as shown. */
export const LANDED_MS = duration.celebrate * 2;

/** The match being celebrated. `likes` and `of` are null until a signal brings them. */
export type PlayingMatch = { title_id: number; likes: number | null; of: number | null };

/** What either signal carries: the vote's `ok` answer has no count, the event has all. */
export type MatchSignal = {
  title_id: number;
  likes?: number;
  of?: number;
  /** Absent on the phone's own answer; `false` means a match the night goes on after. */
  decided?: boolean;
};

export type MatchControllerDeps = {
  isShown: (roomId: string) => boolean;
  markShown: (roomId: string) => void;
  /** The haptic and the sound, once, at the start. */
  onStart: () => void;
  screenReaderOn: () => boolean;
};

export function createMatchController(roomId: string, deps: MatchControllerDeps) {
  let playing: PlayingMatch | null = null;
  let stopped = false;
  let startedAt = 0;
  let landedTimer: ReturnType<typeof setTimeout> | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  function clearTimers() {
    clearTimeout(landedTimer);
    clearTimeout(holdTimer);
    landedTimer = holdTimer = undefined;
  }

  function end() {
    clearTimers();
    deps.markShown(roomId);
    if (playing) {
      playing = null;
      emit();
    }
  }

  function start(match: PlayingMatch) {
    playing = match;
    startedAt = Date.now();
    deps.onStart();
    landedTimer = setTimeout(() => deps.markShown(roomId), LANDED_MS);
    holdTimer = setTimeout(() => {
      // With a screen reader on, the button goes on: the announcement is never cut off.
      if (!deps.screenReaderOn()) end();
    }, duration['match-hold']);
    emit();
  }

  function merge(likes?: number, of?: number) {
    if (!playing) return;
    if (playing.likes !== null && playing.of !== null) return;
    if (likes === undefined || of === undefined) return;
    playing = { ...playing, likes, of };
    emit();
  }

  return {
    get: () => playing,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** The phone's own `ok` with `match: true`, or the `match` event. */
    signal(signal: MatchSignal) {
      if (stopped || signal.decided === false) return;
      if (playing) {
        if (playing.title_id === signal.title_id) merge(signal.likes, signal.of);
        return;
      }
      if (deps.isShown(roomId)) return;
      start({
        title_id: signal.title_id,
        likes: signal.likes ?? null,
        of: signal.of ?? null,
      });
    },

    /** The room and its matches were read again (reconnect, foreground, a missed event). */
    reread(state: RoomState, matches: readonly RoomMatch[]) {
      if (stopped || state !== 'done') return;
      const pick = matches.find((match) => match.pick_order === 1);
      if (!pick) return;
      if (playing) {
        merge(pick.like_count, pick.present_count);
        return;
      }
      if (deps.isShown(roomId)) return;
      start({ title_id: pick.title_id, likes: pick.like_count, of: pick.present_count });
    },

    /** A tap, the button or Android's back. The first 800 ms don't count. */
    skip() {
      if (!playing || Date.now() - startedAt < SKIP_AFTER_MS) return;
      end();
    },

    /** The overlay leaves (the hand-over). */
    finish: end,

    /** The room screen closes: no more overlays, the timers go. */
    stop() {
      stopped = true;
      if (playing) end();
      else clearTimers();
    },
  };
}

export type MatchController = ReturnType<typeof createMatchController>;

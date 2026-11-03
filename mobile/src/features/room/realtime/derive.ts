import type { RoomRealtimeState } from './controller';

/** A channel that rejoins within this long never shows a banner (a starting value). */
export const BANNER_GRACE_MS = 2_000;
/** After this long the banner says it is still trying. */
export const STILL_TRYING_MS = 30_000;
/** A seat missing from presence this long is away (Q21.1). */
export const AWAY_AFTER_MS = 90_000;

export type BannerKind = 'reconnecting' | 'stillTrying' | 'offline';

/** Which banner the connection calls for, if any (reconnecting.md#states). Offline wins. */
export function bannerFor(state: RoomRealtimeState, now: number): BannerKind | null {
  if (!state.online) return 'offline';
  if (state.problemSince === null) return null;
  const elapsed = now - state.problemSince;
  if (elapsed < BANNER_GRACE_MS) return null;
  return elapsed >= STILL_TRYING_MS ? 'stillTrying' : 'reconnecting';
}

/** When the banner next changes by itself, in ms from now, or null if it won't. */
export function nextBannerChange(state: RoomRealtimeState, now: number): number | null {
  if (!state.online || state.problemSince === null) return null;
  const elapsed = now - state.problemSince;
  if (elapsed < BANNER_GRACE_MS) return BANNER_GRACE_MS - elapsed;
  if (elapsed < STILL_TRYING_MS) return STILL_TRYING_MS - elapsed;
  return null;
}

/** Online, both channels joined, and the re-read after the last `SUBSCRIBED` has settled. */
export function isFresh(state: RoomRealtimeState): boolean {
  return state.online && state.events === 'joined' && state.live === 'joined' && !state.reading;
}

/**
 * Online and away seats (ids). Online: in presence now; the phone's own seat whenever its live
 * channel is joined. Away: missing for 90 seconds, counted from the last sighting, from the
 * live channel's latest `SUBSCRIBED` if later (so the first one when never seen), and never
 * while this phone's live channel isn't joined: it can't hear, so it doesn't judge.
 */
export function presenceOf(
  state: RoomRealtimeState,
  seatIds: readonly string[],
  mySeatId: string | undefined,
  now: number,
  joinedAt?: ReadonlyMap<string, number>,
): { online: ReadonlySet<string>; away: ReadonlySet<string>; nextChange: number | null } {
  const online = new Set<string>();
  const away = new Set<string>();
  let nextChange: number | null = null;
  const joined = state.live === 'joined' && state.liveJoinedAt !== null;
  for (const id of seatIds) {
    if (state.present.has(id) || (joined && id === mySeatId)) {
      online.add(id);
      continue;
    }
    if (!joined) continue;
    const since = Math.max(
      state.lastSeen.get(id) ?? 0,
      state.liveJoinedAt ?? 0,
      joinedAt?.get(id) ?? 0,
    );
    const left = AWAY_AFTER_MS - (now - since);
    if (left <= 0) away.add(id);
    else nextChange = nextChange === null ? left : Math.min(nextChange, left);
  }
  return { online, away, nextChange };
}

// Whether a change the phone is about to see was heard happen live (sounds.md#rules-for-every-sound).
// A realtime event notes it; the re-read that follows takes it.
// A re-read after a reconnect or a cold start has no note, so it plays nothing.

export type LiveKind = 'joined';

/** A note older than this is from a read that never came: it plays nothing. */
export const LIVE_WINDOW_MS = 10_000;

const notes = new Map<string, number>();

export function noteLive(roomId: string, kind: LiveKind, now = Date.now()) {
  notes.set(`${roomId}:${kind}`, now);
}

/** True once for each note that is fresh. */
export function takeLive(roomId: string, kind: LiveKind, now = Date.now()): boolean {
  const key = `${roomId}:${kind}`;
  const at = notes.get(key);
  notes.delete(key);
  return at !== undefined && now - at <= LIVE_WINDOW_MS;
}

export function clearLive(roomId: string) {
  for (const key of [...notes.keys()]) if (key.startsWith(`${roomId}:`)) notes.delete(key);
}

/** The start sound is claimed once per start: the host's answer and the event both ask. */
export const START_CLAIM_MS = 5_000;
const startClaims = new Map<string, number>();

export function claimStartSound(roomId: string, now = Date.now()): boolean {
  const last = startClaims.get(roomId);
  if (last !== undefined && now - last < START_CLAIM_MS) return false;
  startClaims.set(roomId, now);
  return true;
}

export function resetStartClaims() {
  startClaims.clear();
}

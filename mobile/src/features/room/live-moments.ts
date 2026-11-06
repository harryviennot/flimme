// Whether a change the phone is about to see was heard happen live (sounds.md#rules-for-every-sound).
// A realtime event, or the host's own Start answer, notes it; the re-read that follows takes it.
// A re-read after a reconnect or a cold start has no note, so it plays nothing.

export type LiveKind = 'state' | 'joined';

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

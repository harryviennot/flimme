// The room screens ask before the phone leaves them any way but Leave (lobby.md#leaving). A
// flow that really takes the phone out of a room (entering another room from a link) releases
// the guards first, so it isn't asked.
const releases = new Set<() => void>();

/** Registers a guard's `disablePrevention`; returns how to unregister it. */
export function registerRoomGuard(release: () => void): () => void {
  releases.add(release);
  return () => {
    releases.delete(release);
  };
}

/** Lets the next navigation out of any open room through without the confirm. */
export function releaseRoomGuards(): void {
  releases.forEach((release) => release());
}

// Countdowns (the Final Cut's 45 seconds) run from the server's deadline, corrected by
// how far this phone's clock is from the server's, so a phone with a wrong clock doesn't
// close early.

let offsetMs = 0;

/**
 * Records the server's time from a response (its Date header, or a timestamp in the
 * payload). The request's midpoint stands in for the moment the server answered.
 */
export function recordServerTime(serverTime: string, requestStartedAt: number, receivedAt: number) {
  const server = Date.parse(serverTime);
  if (Number.isNaN(server) || receivedAt < requestStartedAt) return;
  const midpoint = requestStartedAt + (receivedAt - requestStartedAt) / 2;
  offsetMs = server - midpoint;
}

/** Now, on the server's clock, in milliseconds since the epoch. */
export function serverNow(now: number = Date.now()) {
  return now + offsetMs;
}

/** Milliseconds left until a server deadline, never negative. */
export function msUntil(deadline: string, now: number = Date.now()) {
  const end = Date.parse(deadline);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - serverNow(now));
}

/** For tests. */
export function resetServerTime() {
  offsetMs = 0;
}

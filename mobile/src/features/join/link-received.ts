import { serverNow } from '@/lib/server-time';

// The moment the app received an invite link (cold start or while running), stamped by
// `app/+native-intent.tsx` before the router sees the URL, read once by the join sheet.

let receivedAt: number | undefined;

/** Called when a URL arrives. */
export function markLinkReceived(now: number = Date.now()): void {
  receivedAt = now;
}

/**
 * The phone-clock moment of the link being received, once; the sheet's own opening time when
 * nothing was stamped (a link opened inside the app).
 */
export function takeLinkReceivedAt(now: number = Date.now()): number {
  const at = receivedAt ?? now;
  receivedAt = undefined;
  return at;
}

/** `link_opened_at` for `join_room`: that moment on the server's clock, as an ISO string. */
export function linkOpenedAt(receivedAtMs: number): string {
  return new Date(serverNow(receivedAtMs)).toISOString();
}

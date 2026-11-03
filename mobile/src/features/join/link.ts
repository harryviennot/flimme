import type { RoomState } from '@flimme/contract';

export const CODE_LENGTH = 6;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Any scheme and host, then exactly /join/<6 digits>, an optional query, an optional fragment.
const LINK = /^(?:[a-z][a-z0-9+.-]*:)?(?:\/\/[^/?#\s]+)?\/join\/(\d{6})\/?(?:\?([^#\s]*))?(?:#\S*)?$/i;

/** Keeps the digits of what was typed or pasted, at most six. */
export function digitsOf(text: string): string {
  return text.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

/**
 * Reads an invite link as strictly as the join sheet does: only the path `/join/<6 digits>` and
 * the `r` query value (which must be a uuid) are read. The host, the scheme and every other
 * query parameter are ignored. Anything else is not a link (`null`).
 */
export function parseInviteLink(text: string): { code: string; ref?: string } | null {
  const match = LINK.exec(text.trim());
  if (!match) return null;
  const code = match[1];
  const query = match[2];
  if (!query) return { code };
  let ref: string | undefined;
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if ((eq < 0 ? pair : pair.slice(0, eq)) !== 'r') continue;
    ref = eq < 0 ? '' : pair.slice(eq + 1);
    break;
  }
  if (ref === undefined) return { code };
  return UUID.test(ref) ? { code, ref } : null;
}

/** What a paste gives: the invite link's code and reference, else the digits alone. */
export function readPasted(text: string): { code: string; ref?: string } {
  return parseInviteLink(text) ?? { code: digitsOf(text) };
}

/**
 * Where an `ok` answer goes. `/room/[id]` has no screen of its own until M4.10 routes by state,
 * so the state picks the screen. M4.10 replaces this.
 */
export function roomRouteFor(roomId: string, state: RoomState): string {
  switch (state) {
    case 'swiping':
      return `/room/${roomId}/swipe`;
    case 'finale':
      return `/room/${roomId}/final-cut`;
    default:
      return `/room/${roomId}/lobby`;
  }
}

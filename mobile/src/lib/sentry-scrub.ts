// What may leave the phone in a crash report: no names, codes, emails, ids or IPs
// (privacy.md#crash-reports, security.md#logging-without-personal-data). Pure functions, so
// they are tested without the SDK.
import type { Breadcrumb, Event } from '@sentry/react-native';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /[^\s@()<>]+@[^\s@()<>]+\.[^\s@()<>]+/g;
const SIX_DIGITS = /(?<!\d)\d{6}(?!\d)/g;
const QUERY_OR_FRAGMENT = /[?#]\S*/g;
const JOIN_CODE = /\/join\/[^/\s?#]+/g;
const ROOM_ID = /\/room\/[^/\s?#]+/g;

/** A route, link or url without the things that identify a room or a player. */
function scrubPath(text: string): string {
  return text
    .replace(QUERY_OR_FRAGMENT, '')
    .replace(JOIN_CODE, '/join/[code]')
    .replace(ROOM_ID, '/room/[id]');
}

/** Free text (an error message): blank anything shaped like a code, an id or an email. */
function scrubText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(UUID, '[id]').replace(SIX_DIGITS, '[code]');
}

const BODY_KEYS = new Set(['body', 'request_body', 'response_body', 'requestBody']);

/** Console output is dropped, the rest keeps its shape with the sensitive parts replaced. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === 'console') return null;
  const next: Breadcrumb = { ...crumb };
  if (typeof next.message === 'string') next.message = scrubPath(next.message);
  if (next.data) {
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.data)) {
      if (BODY_KEYS.has(key)) continue;
      data[key] = typeof value === 'string' ? scrubPath(value) : value;
    }
    next.data = data;
  }
  return next;
}

/** The last stop before sending: no user, no request, no device name, no codes in messages. */
export function scrubEvent<E extends Event>(event: E): E {
  const next: E = { ...event };
  delete next.user;
  delete next.request;
  delete next.server_name;
  if (typeof next.message === 'string') next.message = scrubText(next.message);
  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((entry) =>
        typeof entry.value === 'string' ? { ...entry, value: scrubText(entry.value) } : entry,
      ),
    };
  }
  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return next;
}

import { recordServerTime, resetServerTime } from '@/lib/server-time';

import { linkOpenedAt, markLinkReceived, takeLinkReceivedAt } from './link-received';

afterEach(resetServerTime);

describe('link received', () => {
  it('gives the stamped moment once, then the moment of asking', () => {
    markLinkReceived(1000);
    expect(takeLinkReceivedAt(5000)).toBe(1000);
    expect(takeLinkReceivedAt(5000)).toBe(5000);
  });

  it('sends that moment on the server clock as an ISO string', () => {
    expect(linkOpenedAt(Date.parse('2026-11-03T12:00:00Z'))).toBe('2026-11-03T12:00:00.000Z');
    // The phone is 2 seconds behind the server.
    const now = Date.parse('2026-11-03T12:00:00Z');
    recordServerTime(new Date(now + 2000).toISOString(), now, now);
    expect(linkOpenedAt(now)).toBe('2026-11-03T12:00:02.000Z');
  });
});

import { JOIN_ROOM_ANSWERS, ROOM_PREVIEW_ANSWERS } from '@flimme/contract';

import { JOIN_SHEET_ROWS } from './sheet-rows';

describe('JOIN_SHEET_ROWS', () => {
  it.each(JOIN_ROOM_ANSWERS)('has a row for %s', (status) => {
    expect(JOIN_SHEET_ROWS[status]).toBeDefined();
  });

  it.each(ROOM_PREVIEW_ANSWERS)(
    'has a row for the preview answer %s: a refusal, or the room for ok',
    (status) => {
      const row = JOIN_SHEET_ROWS[status];
      expect(row).toBeDefined();
      expect(row.kind).toBe(status === 'ok' ? 'go' : 'refused');
    },
  );

  it.each(['malformed', 'offline', 'failed', 'session_failed'] as const)(
    'has a row for %s',
    (s) => {
      expect(JOIN_SHEET_ROWS[s]).toBeDefined();
    },
  );

  it('says a missing room has ended, for a link', () => {
    expect(JOIN_SHEET_ROWS.not_found).toEqual(JOIN_SHEET_ROWS.closed);
  });

  it('plays no haptic for a malformed link or being offline, and one for the other refusals', () => {
    for (const [name, row] of Object.entries(JOIN_SHEET_ROWS)) {
      if (row.kind !== 'refused') continue;
      expect([name, row.haptic]).toEqual([name, name !== 'malformed' && name !== 'offline']);
    }
  });

  it('offers Retry when the call or the sign-in failed, and joins by itself when offline', () => {
    expect(JOIN_SHEET_ROWS.failed).toMatchObject({ next: 'retry' });
    expect(JOIN_SHEET_ROWS.session_failed).toMatchObject({ next: 'retry' });
    expect(JOIN_SHEET_ROWS.offline).toMatchObject({ next: 'auto', error: false });
  });
});

import { JOIN_ROOM_ANSWERS } from '@flimme/contract';

import { OFFER_ROWS } from './join-rows';

describe('join offer rows', () => {
  it.each(JOIN_ROOM_ANSWERS)('has a row for %s', (status) => {
    expect(OFFER_ROWS[status]).toBeDefined();
  });

  it('uses the join sheet copy for the refusals', () => {
    expect(OFFER_ROWS.full).toMatchObject({ message: 'errors.full', button: 'retry' });
    expect(OFFER_ROWS.locked).toMatchObject({ message: 'errors.locked', button: 'retry' });
    expect(OFFER_ROWS.in_finale).toMatchObject({ message: 'errors.inFinale', button: 'hidden' });
    expect(OFFER_ROWS.closed).toMatchObject({ message: 'errors.closed', button: 'hidden' });
    expect(OFFER_ROWS.not_found).toMatchObject({ message: 'errors.closed', button: 'hidden' });
    expect(OFFER_ROWS.rate_limited).toMatchObject({
      message: 'errors.rateLimited',
      button: 'retry',
    });
  });
});

import { PLAY_AGAIN_ANSWERS } from '@flimme/contract';

import { PLAY_AGAIN_ROWS } from './rows';

describe('play again rows', () => {
  it.each(PLAY_AGAIN_ANSWERS)('has a row for %s', (status) => {
    expect(PLAY_AGAIN_ROWS[status]).toBeDefined();
  });

  it('hides the button only for unknown_mode', () => {
    expect(PLAY_AGAIN_ROWS.unknown_mode).toMatchObject({ kind: 'toast', hide: true });
    expect(PLAY_AGAIN_ROWS.not_finished).toMatchObject({ kind: 'toast', hide: false });
  });
});

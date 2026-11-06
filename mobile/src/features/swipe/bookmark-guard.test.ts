import { duration } from '@/theme/motion';

import { isLanding, LANDING_GUARD_MS } from './bookmark-guard';

describe('the bookmark landing guard', () => {
  it('lasts duration.base, 250 ms', () => {
    expect(LANDING_GUARD_MS).toBe(duration.base);
    expect(LANDING_GUARD_MS).toBe(250);
  });

  it('ignores a tap during the first 250 ms and accepts it after', () => {
    expect(isLanding(1000, 1000)).toBe(true);
    expect(isLanding(1000, 1249)).toBe(true);
    expect(isLanding(1000, 1250)).toBe(false);
    expect(isLanding(1000, 5000)).toBe(false);
  });
});

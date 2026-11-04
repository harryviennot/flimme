import { duration } from '@/theme/motion';

import { matchMotion } from './motion';

describe('the match overlay motion', () => {
  it('scales the poster in from card size, chases the bulbs and staggers the avatars', () => {
    const motion = matchMotion(false, 400);
    expect(motion.posterStart.scale).toBeLessThan(1);
    expect(motion.posterStart.opacity).toBe(1);
    expect(motion.chasing).toBe(true);
    expect(motion.avatarDelay(0)).toBe(duration.celebrate);
    expect(motion.avatarDelay(3) - motion.avatarDelay(2)).toBe(duration.instant);
    expect(motion.detailsDelay(10)).toBe(duration.celebrate + 10 * duration.instant);
  });

  it('with Reduce Motion fades the poster at full size, with no chase and no stagger', () => {
    const motion = matchMotion(true, 400);
    expect(motion.posterStart).toEqual({ scale: 1, opacity: 0 });
    expect(motion.chasing).toBe(false);
    expect(new Set([0, 1, 5, 9].map(motion.avatarDelay))).toEqual(new Set([0]));
    expect(motion.detailsDelay(10)).toBe(0);
  });
});

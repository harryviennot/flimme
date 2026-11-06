import { layout, stackMotion } from './motion';

describe('the player stack under Reduce Motion', () => {
  it('pops seats in and slides the others by default', () => {
    const motion = stackMotion(false);
    expect(motion.entering).toBe(layout.popIn);
    expect(motion.layout).toBeDefined();
  });

  it('fades seats in and slides nobody with Reduce Motion', () => {
    const motion = stackMotion(true);
    expect(motion.entering).toBe(layout.fadeIn);
    expect(motion.layout).toBeUndefined();
  });
});

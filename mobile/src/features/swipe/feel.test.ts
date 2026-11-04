import { commitLines, decideRelease, directionOf, progressOf, THROW_SPEED, tiltFor } from './feel';

const SCREEN = { width: 400, height: 800 };
const lines = commitLines(SCREEN.width, SCREEN.height);

describe('commit lines', () => {
  it('are 30% of the width sideways and 18% of the height up', () => {
    expect(lines).toEqual({ x: 120, y: 144 });
  });
});

describe('directionOf', () => {
  it('reads right, left and up', () => {
    expect(directionOf(50, 0)).toBe('right');
    expect(directionOf(-50, 0)).toBe('left');
    expect(directionOf(0, -50)).toBe('up');
  });

  it('counts up only within 30 degrees of straight up', () => {
    expect(directionOf(20, -100)).toBe('up'); // about 11 degrees
    expect(directionOf(50, -100)).toBe('up'); // about 27 degrees
    expect(directionOf(70, -100)).toBe('right'); // about 35 degrees: the sideways side wins
    expect(directionOf(-70, -100)).toBe('left');
  });

  it('gives no answer for down, nor for no movement', () => {
    expect(directionOf(0, 80)).toBeNull();
    expect(directionOf(10, 80)).toBeNull();
    expect(directionOf(0, 0)).toBeNull();
  });

  it('lets a diagonal downward drag go sideways when it is mostly sideways', () => {
    expect(directionOf(100, 40)).toBe('right');
    expect(directionOf(-100, 40)).toBe('left');
  });
});

describe('progressOf', () => {
  it('is 0 at rest and 1 at the line, capped at 1', () => {
    expect(progressOf(0, 0, lines)).toBe(0);
    expect(progressOf(60, 0, lines)).toBeCloseTo(0.5);
    expect(progressOf(120, 0, lines)).toBe(1);
    expect(progressOf(300, 0, lines)).toBe(1);
    expect(progressOf(0, -72, lines)).toBeCloseTo(0.5);
  });

  it('is 0 for down', () => {
    expect(progressOf(0, 200, lines)).toBe(0);
  });
});

describe('decideRelease', () => {
  const still = { vx: 0, vy: 0 };

  it('throws right past the line, left past the line, up past the line', () => {
    expect(decideRelease({ dx: 130, dy: 0, ...still }, lines)).toBe('right');
    expect(decideRelease({ dx: -130, dy: 10, ...still }, lines)).toBe('left');
    expect(decideRelease({ dx: 10, dy: -150, ...still }, lines)).toBe('up');
  });

  it('does nothing before the line, slowly', () => {
    expect(decideRelease({ dx: 100, dy: 0, vx: 100, vy: 0 }, lines)).toBeNull();
    expect(decideRelease({ dx: 0, dy: -100, ...still }, lines)).toBeNull();
    expect(decideRelease({ dx: 0, dy: 200, ...still }, lines)).toBeNull();
  });

  it('throws early on a flick faster than the throw speed', () => {
    expect(decideRelease({ dx: 30, dy: 0, vx: THROW_SPEED + 1, vy: 0 }, lines)).toBe('right');
    expect(decideRelease({ dx: -30, dy: 0, vx: -(THROW_SPEED + 1), vy: 0 }, lines)).toBe('left');
    expect(decideRelease({ dx: 0, dy: -30, vx: 0, vy: -(THROW_SPEED + 1) }, lines)).toBe('up');
  });

  it('does not throw on a flick slower than the throw speed', () => {
    expect(decideRelease({ dx: 30, dy: 0, vx: THROW_SPEED - 1, vy: 0 }, lines)).toBeNull();
  });

  it('does not throw on a flick against where the card sits', () => {
    expect(decideRelease({ dx: -60, dy: 0, vx: THROW_SPEED + 100, vy: 0 }, lines)).toBeNull();
  });

  it('does not throw on a fast flick downward', () => {
    expect(decideRelease({ dx: 0, dy: 20, vx: 0, vy: 2000 }, lines)).toBeNull();
  });
});

describe('tiltFor', () => {
  it('is the tilt at the line, capped at the maximum, and signed with the drag', () => {
    expect(tiltFor(0, lines)).toBe(0);
    expect(tiltFor(120, lines)).toBe(10);
    expect(tiltFor(-120, lines)).toBe(-10);
    expect(tiltFor(1000, lines)).toBe(15);
    expect(tiltFor(-1000, lines)).toBe(-15);
  });
});

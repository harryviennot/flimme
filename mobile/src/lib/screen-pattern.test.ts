import { screenPattern } from './screen-pattern';

describe('screenPattern', () => {
  it('names a screen by its route pattern, never by the code in the link', () => {
    // The router's segments for /join/482913.
    expect(screenPattern(['join', '[code]'])).toBe('/join/[code]');
  });

  it('keeps the room route a pattern', () => {
    expect(screenPattern(['room', '[id]', 'lobby'])).toBe('/room/[id]/lobby');
  });

  it('names the root, and leaves groups out', () => {
    expect(screenPattern([])).toBe('/');
    expect(screenPattern(['(tabs)', 'home'])).toBe('/home');
  });

  it('skips the dev menu and unusual routes', () => {
    expect(screenPattern(['dev', 'gallery'])).toBeNull();
    expect(screenPattern(['+not-found'])).toBeNull();
  });
});

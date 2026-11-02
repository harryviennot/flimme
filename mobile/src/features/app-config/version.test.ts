import { isBelowMinimum } from './version';

describe('isBelowMinimum', () => {
  it('is true when the current version is older', () => {
    expect(isBelowMinimum('0.9.9', '1.0.0')).toBe(true);
    expect(isBelowMinimum('1.0.0', '1.0.1')).toBe(true);
    expect(isBelowMinimum('1.2.9', '1.3.0')).toBe(true);
  });

  it('is false for the same version or a newer one', () => {
    expect(isBelowMinimum('1.0.0', '1.0.0')).toBe(false);
    expect(isBelowMinimum('1.0.1', '1.0.0')).toBe(false);
    expect(isBelowMinimum('2.0.0', '1.9.9')).toBe(false);
  });

  it('compares numbers, not text', () => {
    expect(isBelowMinimum('1.10.0', '1.9.0')).toBe(false);
    expect(isBelowMinimum('1.9.0', '1.10.0')).toBe(true);
  });

  it('is never true for a malformed version on either side', () => {
    expect(isBelowMinimum('', '1.0.0')).toBe(false);
    expect(isBelowMinimum('abc', '1.0.0')).toBe(false);
    expect(isBelowMinimum('1.0', '2.0.0')).toBe(false);
    expect(isBelowMinimum('0.1.0', 'soon')).toBe(false);
    expect(isBelowMinimum('0.1.0', '1.0.0-beta')).toBe(false);
  });
});

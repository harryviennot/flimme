import {
  isLargeText,
  logoSlots,
  splitServices,
  synopsisFit,
  LOGO_GAP,
  LOGO_SIZE,
} from './card-back-layout';

const names = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}` }));

describe('logoSlots', () => {
  it('fits 32-point squares 6 points apart', () => {
    expect(LOGO_SIZE).toBe(32);
    expect(LOGO_GAP).toBe(6);
    expect(logoSlots(32)).toBe(1);
    expect(logoSlots(70)).toBe(2);
    expect(logoSlots(69)).toBe(1);
    expect(logoSlots(300)).toBe(8);
  });

  it('is 0 before the row is measured, and never negative', () => {
    expect(logoSlots(0)).toBe(0);
    expect(logoSlots(-5)).toBe(0);
  });
});

describe('splitServices', () => {
  it('shows them all when they fit', () => {
    expect(splitServices(names(3), 3)).toEqual({ shown: names(3), hidden: 0 });
    expect(splitServices(names(2), 6)).toEqual({ shown: names(2), hidden: 0 });
  });

  it('gives the last square to "+n" when they do not fit, counting the ones behind it', () => {
    const { shown, hidden } = splitServices(names(6), 4);
    expect(shown.map((s) => s.name)).toEqual(['S1', 'S2', 'S3']);
    expect(hidden).toBe(3);
  });

  it('a row of two holds one logo and "+n" for three services (a 375 phone with the Trailer)', () => {
    const { shown, hidden } = splitServices(names(3), 2);
    expect(shown).toHaveLength(1);
    expect(hidden).toBe(2);
  });

  it('with room for one square shows only "+n"', () => {
    expect(splitServices(names(4), 1)).toEqual({ shown: [], hidden: 4 });
  });

  it('shows nothing before the row is measured', () => {
    expect(splitServices(names(4), 0)).toEqual({ shown: [], hidden: 0 });
  });
});

describe('synopsisFit', () => {
  it('has no limit until the room and a line are measured', () => {
    expect(synopsisFit({ room: 0, line: 20, full: 9, link: true })).toEqual({
      lines: undefined,
      cut: false,
    });
  });

  it('shows the whole text when it fits', () => {
    expect(synopsisFit({ room: 160, line: 20, full: 6, link: true })).toEqual({
      lines: 8,
      cut: false,
    });
  });

  it('is cut a line earlier when "Read more" needs the line', () => {
    expect(synopsisFit({ room: 160, line: 20, full: 12, link: true })).toEqual({
      lines: 7,
      cut: true,
    });
  });

  it('is cut at the room without a link', () => {
    expect(synopsisFit({ room: 160, line: 20, full: 12, link: false })).toEqual({
      lines: 8,
      cut: true,
    });
  });

  it('keeps one line in a tiny room', () => {
    expect(synopsisFit({ room: 5, line: 20, full: 12, link: true }).lines).toBe(1);
  });

  it('reads an exact fit as not cut', () => {
    expect(synopsisFit({ room: 160, line: 20, full: 8, link: true }).cut).toBe(false);
  });
});

describe('isLargeText', () => {
  it('moves the title into the body above 1.3', () => {
    expect(isLargeText(1)).toBe(false);
    expect(isLargeText(1.3)).toBe(false);
    expect(isLargeText(1.31)).toBe(true);
  });
});

import { tokens } from '@/theme/generated/tokens';

// The card front's fade must show most of the poster and still keep the text readable
// (WCAG AA) over a bright poster. Colours are read from the generated tokens.

const stops = tokens.gradient['card-front-scrim'].stops as readonly {
  color: string;
  position: number;
}[];

const alphaOf = (hex: string) => parseInt(hex.slice(7, 9) || 'ff', 16) / 255;

/** The scrim's opacity at a position (0 top, 1 bottom), interpolated between stops. */
function alphaAt(p: number) {
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (p <= b.position) {
      const k = (p - a.position) / (b.position - a.position);
      return alphaOf(a.color) + k * (alphaOf(b.color) - alphaOf(a.color));
    }
  }
  return alphaOf(stops[stops.length - 1]!.color);
}

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (hex: string) =>
  0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
  0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
  0.0722 * channel(parseInt(hex.slice(5, 7), 16));
const mix = (poster: string, scrim: string, a: number) => {
  const m = (i: number) =>
    Math.round(
      (1 - a) * parseInt(poster.slice(i, i + 2), 16) + a * parseInt(scrim.slice(i, i + 2), 16),
    );
  return `#${[1, 3, 5].map((i) => m(i).toString(16).padStart(2, '0')).join('')}`;
};
const contrast = (fg: string, bg: string) => {
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y! - x!);
  return (hi! + 0.05) / (lo! + 0.05);
};

// A bright poster (a pale sky, a snow scene), lighter than nearly all posters.
const BRIGHT = '#c8c8c8';
const text = tokens.color['text-primary'];
const base = tokens.color['bg-sunken'];

describe('card front scrim', () => {
  it('is a soft ramp: many stops, clear at the top, never solid, rising steadily', () => {
    expect(stops.length).toBeGreaterThanOrEqual(8);
    expect(alphaOf(stops[0]!.color)).toBe(0);
    for (let i = 1; i < stops.length; i++) {
      expect(alphaOf(stops[i]!.color)).toBeGreaterThanOrEqual(alphaOf(stops[i - 1]!.color));
    }
    expect(alphaOf(stops[stops.length - 1]!.color)).toBeLessThanOrEqual(0.9);
  });

  it('leaves most of the poster showing', () => {
    expect(alphaAt(0.5)).toBeLessThanOrEqual(0.25);
    expect(alphaAt(0.35)).toBeLessThanOrEqual(0.1);
  });

  it('keeps the title (large text, 3:1) readable over a bright poster', () => {
    expect(contrast(text, mix(BRIGHT, base, alphaAt(0.7)))).toBeGreaterThanOrEqual(3);
  });

  it('keeps the meta line (4.5:1) readable over a bright poster', () => {
    expect(contrast(text, mix(BRIGHT, base, alphaAt(0.88)))).toBeGreaterThanOrEqual(4.5);
  });
});

import { render, screen } from '@testing-library/react-native';

import { tokens } from '@/theme/generated/tokens';

import { opticalOffset, Text, type TextVariant } from './text';

const staatliches: TextVariant[] = [
  'display-xl',
  'display-l',
  'display-m',
  'display-s',
  'label-button-l',
  'label-button-s',
  'display-ticket',
  'display-stamp',
  'avatar-s',
  'avatar-m',
  'avatar-l',
];

describe('Text', () => {
  it.each(staatliches)('moves %s down so its capitals sit in the middle of the box', (variant) => {
    const { fontFamily, fontSize, lineHeight } = tokens.typography[variant];
    expect(fontFamily).toContain('Staatliches');
    // Caps are 69.6% of the em, the baseline is 30% of the em above the box bottom.
    expect(opticalOffset(variant)).toBeCloseTo(Math.max(0, fontSize * 0.648 - lineHeight / 2), 5);
    expect(opticalOffset(variant)).toBeGreaterThan(0);
  });

  it('leaves the other fonts where they are', () => {
    expect(opticalOffset('body-m')).toBe(0);
    expect(opticalOffset('mono-data')).toBe(0);
    expect(opticalOffset('title-l')).toBe(0);
  });

  it('applies the offset as a transform, and none for other fonts', async () => {
    await render(
      <>
        <Text variant="display-m">Pin</Text>
        <Text variant="body-m">Body</Text>
      </>,
    );
    expect(screen.getByText('Pin')).toHaveStyle({
      transform: [{ translateY: opticalOffset('display-m') }],
    });
    expect(screen.getByText('Body').props.style).toBeUndefined();
  });

  // Staatliches: accented capitals (É, È, Ê, À, Ô) reach 0.928 em above the baseline, and iOS
  // puts the baseline 0.3 em above the bottom of the line box and clips to the box.
  const ACCENT_TOP = 0.928;
  const BASELINE_FROM_BOTTOM = 0.3;
  it.each(staatliches.filter((v) => v !== 'display-stamp' && v !== 'display-ticket'))(
    'leaves room above %s for the accent on a capital (iOS clips to the line box)',
    (variant) => {
      const { fontSize, lineHeight } = tokens.typography[variant];
      expect(lineHeight).toBeGreaterThanOrEqual(fontSize * (ACCENT_TOP + BASELINE_FROM_BOTTOM));
    },
  );

  it.each(['display-stamp', 'display-ticket'] as const)(
    'never sets a line height below the font size on %s: iOS clips the glyph tops',
    (variant) => {
      const { fontSize, lineHeight } = tokens.typography[variant];
      expect(lineHeight).toBeGreaterThanOrEqual(fontSize);
    },
  );
});

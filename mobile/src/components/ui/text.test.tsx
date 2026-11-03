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

  it.each(['display-xl', 'display-l', 'display-m', 'display-stamp'] as const)(
    'never sets a line height below the font size on %s: iOS clips the glyph tops',
    (variant) => {
      const { fontSize, lineHeight } = tokens.typography[variant];
      expect(lineHeight).toBeGreaterThanOrEqual(fontSize);
    },
  );
});

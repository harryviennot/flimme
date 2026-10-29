import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';

import { icons, type IconName } from '@/theme/generated/icons';
import { tokens, type ColorToken } from '@/theme/generated/tokens';

export type { IconName };

export type IconProps = {
  name: IconName;
  /** Points. The Figma's icons are drawn at 24. */
  size?: number;
  color?: ColorToken;
  /** Stroke width in the icon's 24-point grid. */
  strokeWidth?: number;
  /** Fills the shape too (the heart and star on the swipe buttons). */
  filled?: boolean;
};

/** One of the Figma's 38 icons, recoloured with a color token. Decorative to screen readers. */
export function Icon({
  name,
  size = 24,
  color = 'text-primary',
  strokeWidth = 2,
  filled = false,
}: IconProps) {
  const xml = useMemo(() => {
    let svg: string = icons[name];
    if (strokeWidth !== 2)
      svg = svg.replaceAll('stroke-width="2"', `stroke-width="${strokeWidth}"`);
    if (filled) svg = svg.replace('fill="none"', 'fill="currentColor"');
    return svg;
  }, [name, strokeWidth, filled]);

  return (
    <SvgXml
      xml={xml}
      width={size}
      height={size}
      color={tokens.color[color]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}

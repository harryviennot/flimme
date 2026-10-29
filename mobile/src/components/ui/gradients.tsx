import { LinearGradient } from 'expo-linear-gradient';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { tokens } from '@/theme/generated/tokens';

// The Figma's paint styles. Linear ones use expo-linear-gradient; the spotlights are
// radial, which native styles can't draw, so they're SVG.

type Stops = readonly { color: string; position: number }[];

export type ScrimProps = { gradient?: 'card-scrim' | 'marquee-sunset' };

/** A linear gradient filling its parent (absolutely positioned). */
export function GradientFill({ gradient = 'card-scrim' }: ScrimProps) {
  const g = tokens.gradient[gradient];
  const stops = g.stops as Stops;
  const horizontal = 'angle' in g && g.angle === 90;
  return (
    <LinearGradient
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      colors={stops.map((s) => s.color) as [string, string, ...string[]]}
      locations={stops.map((s) => s.position) as [number, number, ...number[]]}
      start={horizontal ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
      end={horizontal ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
    />
  );
}

export type SpotlightProps = {
  tone?: 'accent' | 'like' | 'marquee';
};

/**
 * A projector spotlight behind hero content (the match, the winner). Fills its parent;
 * put it first so the content sits on top.
 */
export function Spotlight({ tone = 'accent' }: SpotlightProps) {
  const id = useId().replace(/:/g, '');
  const stops = tokens.gradient[`spotlight-${tone}`].stops as Stops;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            {stops.map((s) => (
              <Stop
                key={s.position}
                offset={s.position}
                stopColor={s.color.slice(0, 7)}
                stopOpacity={alpha(s.color)}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The alpha of an 8-digit hex color, 0 to 1. */
function alpha(hex: string) {
  return hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
}

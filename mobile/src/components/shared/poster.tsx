import { Image, type ImageProps } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { cn } from '@/lib/cn';
import { duration } from '@/theme/motion';

export type PosterSource = ImageProps['source'];

export type PosterProps = {
  source: PosterSource;
  /** The thumbhash computed at ingest (roadmap M2.8), shown while the image loads. */
  thumbhash?: string;
  /** What a screen reader says, usually the film's title. */
  accessibilityLabel?: string;
};

/**
 * A film's poster filling its parent, with its placeholder while loading. Posters come from
 * TMDB at w500 (w780 on large screens), never the original size (app-structure.md).
 */
export function Poster({ source, thumbhash, accessibilityLabel }: PosterProps) {
  return (
    <Image
      source={source}
      placeholder={thumbhash ? { thumbhash } : undefined}
      contentFit="cover"
      transition={duration.fast}
      style={StyleSheet.absoluteFill}
      accessibilityLabel={accessibilityLabel}
      accessible={!!accessibilityLabel}
    />
  );
}

const thumbSizes = {
  s: 'h-20.25 w-13.5',
  m: 'h-27 w-18',
} as const;

export type PosterThumbProps = PosterProps & { size?: keyof typeof thumbSizes };

/** Figma "Poster thumb": a small poster for lists, the Final Cut and the profile. */
export function PosterThumb({ size = 'm', ...props }: PosterThumbProps) {
  return (
    <View className={cn('overflow-hidden rounded-sm bg-bg-raised', thumbSizes[size])}>
      <Poster {...props} />
    </View>
  );
}

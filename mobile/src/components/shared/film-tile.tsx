import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { timing } from '@/theme/motion';

import { Poster, type PosterSource } from './poster';

// A film's poster as a tile (my-films.md): the poster only, with its placeholder when there is
// none, and at most one badge in the top right corner. Used by My films and the pick sheet.

export type FilmTileBadge = { kind: 'picked'; label: string } | { kind: 'super' };

export type FilmTileProps = {
  /** Points; the height is 1.5 times it, the poster's 2:3 shape. */
  width: number;
  title: string;
  year?: number | null;
  poster: PosterSource;
  thumbhash?: string;
  badge?: FilmTileBadge;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
};

const PRESSED_SCALE = 0.96;

export function FilmTile({
  width,
  title,
  year,
  poster,
  thumbhash,
  badge,
  onPress,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: FilmTileProps) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      hitSlop={0}
      onPressIn={() => scale.set(withTiming(PRESSED_SCALE, timing.press))}
      onPressOut={() => scale.set(withTiming(1, timing.release))}
    >
      <Animated.View
        style={[{ width, height: width * 1.5 }, style]}
        className="overflow-hidden rounded-sm bg-bg-raised"
      >
        {poster ? (
          <Poster source={poster} thumbhash={thumbhash} />
        ) : (
          <View className="flex-1 justify-end gap-1 p-2" testID="film-tile-placeholder">
            <Text
              variant="body-m-strong"
              numberOfLines={3}
              maxFontSizeMultiplier={1.2}
              importantForAccessibility="no"
            >
              {title}
            </Text>
            {year != null ? (
              <Text variant="mono-data" tone="muted" maxFontSizeMultiplier={1.2}>
                {String(year)}
              </Text>
            ) : null}
          </View>
        )}
        {badge ? (
          <View
            className="absolute top-1.5 right-1.5"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {badge.kind === 'picked' ? (
              <Tag label={badge.label} tone="marquee" />
            ) : (
              <View
                testID="film-tile-star"
                className="size-6 items-center justify-center rounded-pill bg-bg-sunken"
              >
                <Icon name="star" size={14} filled color="marquee-default" />
              </View>
            )}
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

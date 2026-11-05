import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { PosterThumb } from '@/components/shared/poster';
import { FAN_SIZE, type SessionEntry } from '@/features/solo/session';
import { posterUrl } from '@/features/swipe/poster-url';
import { tokens } from '@/theme/generated/tokens';
import { duration, spring } from '@/theme/motion';

// Up to five posters of this session's likes, overlapping and turned from the middle one, which is
// on top (moments.md#the-checkpoint). They fan out one after the other, each `duration.instant`
// after the one before; with Reduce Motion they start fanned. Hidden from screen readers: the
// line under them says the count.

function FanPoster({
  entry,
  index,
  count,
  imageBase,
  screenWidth,
}: {
  entry: SessionEntry;
  index: number;
  count: number;
  imageBase: string | undefined;
  screenWidth: number;
}) {
  const reduced = useReducedMotion();
  const middle = (count - 1) / 2;
  const angle = (index - middle) * tokens.rotation['poster-fan'];
  const spread = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    spread.set(withDelay(index * duration.instant, withSpring(1, spring.snappy)));
  }, [reduced, index, spread]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle * spread.get()}deg` }],
  }));
  const uri = posterUrl(imageBase, entry.card.poster_path, screenWidth);
  return (
    <Animated.View
      className={index === 0 ? '' : '-ml-8'}
      style={[style, { zIndex: count - Math.round(Math.abs(index - middle)) }]}
    >
      <PosterThumb
        size="m"
        source={uri ? { uri } : undefined}
        thumbhash={entry.card.poster_placeholder ?? undefined}
      />
    </Animated.View>
  );
}

export function LikesFan({
  likes,
  imageBase,
  screenWidth,
}: {
  likes: readonly SessionEntry[];
  imageBase: string | undefined;
  screenWidth: number;
}) {
  const shown = likes.slice(0, FAN_SIZE);
  return (
    <View
      className="flex-row justify-center py-2"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      testID="likes-fan"
    >
      {shown.map((entry, index) => (
        <FanPoster
          key={entry.card.title_id}
          entry={entry}
          index={index}
          count={shown.length}
          imageBase={imageBase}
          screenWidth={screenWidth}
        />
      ))}
    </View>
  );
}

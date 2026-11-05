import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { PosterThumb } from '@/components/shared/poster';
import { Text } from '@/components/ui/text';
import { formatList } from '@/features/lobby/names';
import { useShortlistView } from '@/features/shortlist/context';
import { useShortlistCards, type ShortlistFilm } from '@/features/shortlist/use-shortlist-cards';
import { layout, spring } from '@/theme/motion';

import { registerSlot } from './slots';

// The room's shortlist in the top bar (swipe.md#the-shortlist): the count, then one slot per
// place, filled left to right in the order the films matched. It is the room's, never anyone's.

/** The widest shortlist drawn (the launch modes use 3). */
const MAX_SLOTS = 5;

export function Shortlist({ roomId }: { roomId: string }) {
  const { t, i18n } = useTranslation('swipe');
  const view = useShortlistView();
  const films = useShortlistCards(roomId, view.landed, i18n.language);
  // In a mode whose first match is the pick there is no shortlist.
  if (view.size <= 1) return null;

  const count = view.landed.length;
  const slots = Math.min(view.size, MAX_SLOTS);
  const titles = view.landed.flatMap((id) => films.get(id)?.title ?? []);
  const label =
    count === 0
      ? t('shortlist.a11yEmpty', { of: view.size })
      : t('shortlist.a11y', {
          count,
          of: view.size,
          titles: formatList(titles, i18n.language),
        });

  return (
    <View
      accessible
      accessibilityLabel={label}
      testID="shortlist"
      className="shrink-0 flex-row items-center gap-2"
    >
      <Text
        variant="mono-data"
        tone={count === 0 ? 'muted' : 'secondary'}
        maxFontSizeMultiplier={1.2}
      >
        {t('shortlist.count', { count, of: view.size })}
      </Text>
      <View className="flex-row gap-1">
        {Array.from({ length: slots }, (_, index) => {
          const id = view.landed[index];
          return (
            <Slot
              key={index}
              index={index}
              film={id === undefined ? undefined : (films.get(id) ?? null)}
              fresh={id !== undefined && view.fresh.has(id)}
            />
          );
        })}
      </View>
    </View>
  );
}

/** `film` undefined: empty. Null: filled, the card not read yet (the frame and the ring show). */
function Slot({
  index,
  film,
  fresh,
}: {
  index: number;
  film: ShortlistFilm | null | undefined;
  fresh: boolean;
}) {
  return (
    <View
      ref={(view) => registerSlot(index, view)}
      collapsable={false}
      testID={film === undefined ? 'shortlist-slot-empty' : 'shortlist-slot-filled'}
      className="h-9 w-6"
    >
      {film === undefined ? (
        <View className="h-9 w-6 rounded-xs border border-border-default bg-bg-raised" />
      ) : (
        <Filled film={film} fresh={fresh} />
      )}
    </View>
  );
}

function Filled({ film, fresh }: { film: ShortlistFilm | null; fresh: boolean }) {
  const reduced = useReducedMotion();
  // A film that just landed pops from 1.15 to 1; one read back appears as it is.
  const scale = useSharedValue(fresh && !reduced ? 1.15 : 1);
  useEffect(() => {
    scale.set(withSpring(1, spring.snappy));
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={style} entering={fresh ? undefined : layout.fadeIn} className="h-9 w-6">
      {film?.posterUri ? (
        <PosterThumb
          size="xs"
          source={{ uri: film.posterUri }}
          thumbhash={film.thumbhash}
          accessibilityLabel={film.title}
        />
      ) : (
        <View className="h-9 w-6 rounded-xs bg-bg-raised" />
      )}
      <View
        pointerEvents="none"
        className="absolute inset-0 rounded-xs border border-marquee-default"
      />
    </Animated.View>
  );
}

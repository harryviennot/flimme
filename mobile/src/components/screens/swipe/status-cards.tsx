import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { tonightsFilters } from '@/features/ending/filters';
import { useCountryProviders } from '@/features/host/queries';
import { useRoom } from '@/features/room';
import { SLOW_LOADING_MS } from '@/features/swipe/feel';
import { layout } from '@/theme/motion';

// What takes the top card's place when there is no card to show. Each is as big as a card, so
// the buttons and the stack don't move when the real card arrives.

type Size = { width: number; height: number };

/** Past the mounted cards, the refill is late: a card-size skeleton, nothing else. */
export function LoadingCard({ size, onRetry }: { size: Size; onRetry: () => void }) {
  const { t } = useTranslation('swipe');
  const { t: tc } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View
      accessible
      accessibilityLabel={t('loading.a11y')}
      style={{ width: size.width, height: size.height }}
    >
      <Skeleton className="size-full rounded-xl" />
      {slow ? (
        <Animated.View
          entering={layout.fadeIn}
          className="absolute inset-0 items-center justify-center gap-3 px-6"
        >
          <Text variant="body-s" tone="muted" align="center">
            {t('loading.slow')}
          </Text>
          <Button label={tc('actions.retry')} variant="secondary" size="s" onPress={onRetry} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Frame({ size, children }: { size: Size; children: React.ReactNode }) {
  return (
    <Animated.View
      entering={layout.fadeIn}
      style={{ width: size.width, height: size.height }}
      className="justify-center rounded-xl border border-border-default bg-bg-surface"
    >
      {children}
    </Animated.View>
  );
}

/** Offline with no card left: the votes are kept and go when the connection is back. */
export function WaitingCard({ size }: { size: Size }) {
  const { t } = useTranslation('swipe');
  return (
    <Frame size={size}>
      <EmptyState icon="wifi-off" title={t('waiting.title')} body={t('waiting.body')} />
    </Frame>
  );
}

/**
 * This player is out of cards: the server dealt nothing more (swipe.md#the-done-card-nothing-left).
 * Tonight's filters say why; the count is how many films the room has liked, never which.
 */
export function DoneCard({
  size,
  roomId,
  liked,
}: {
  size: Size;
  roomId: string;
  liked: number | null;
}) {
  const { t } = useTranslation('swipe');
  const { t: te, i18n } = useTranslation('ending');
  const room = useRoom(roomId).data;
  const providers = useCountryProviders(room?.country).data;
  const filters = room ? tonightsFilters(room, providers, te, i18n.language) : null;
  return (
    <Frame size={size}>
      <ScrollView contentContainerClassName="grow justify-center">
        <EmptyState icon="popcorn" title={t('done.title')} body={t('done.body')} autoFocus>
          <View className="items-center gap-2">
            {filters && filters.tags.length > 0 ? (
              <View accessible accessibilityLabel={filters.a11y} className="items-center gap-2">
                <Text variant="mono-eyebrow" tone="secondary" align="center">
                  {te('nothingLeft.filters')}
                </Text>
                <View className="flex-row flex-wrap justify-center gap-1.5">
                  {filters.tags.map((tag) => (
                    <Tag key={tag.id} label={tag.label} icon={tag.icon} tone="neutral" />
                  ))}
                </View>
              </View>
            ) : null}
            {liked !== null ? (
              <Text variant="mono-data" tone="like" align="center">
                {te('nothingLeft.liked', { count: liked })}
              </Text>
            ) : null}
          </View>
        </EmptyState>
      </ScrollView>
    </Frame>
  );
}

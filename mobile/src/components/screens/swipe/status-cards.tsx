import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
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

/** This player has answered every card the room has for them. */
export function DoneCard({ size }: { size: Size }) {
  const { t } = useTranslation('swipe');
  return (
    <Frame size={size}>
      <EmptyState icon="popcorn" title={t('done.title')} body={t('done.body')} />
    </Frame>
  );
}

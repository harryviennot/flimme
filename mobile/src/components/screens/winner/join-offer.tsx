import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { OfferHost } from '@/features/play-again/offer';
import type { OfferView } from '@/features/play-again/use-join-offer';
import { layout } from '@/theme/motion';

export type JoinOfferProps = {
  host: OfferHost;
  view: OfferView;
  /** The offer appeared while the screen was showing: it slides in and its title is announced. */
  arrived?: boolean;
  onJoin: () => void;
};

/** "Harry started another game: Join" (winner.md#the-join-offer): an inline card above Home. */
export function JoinOffer({ host, view, arrived = false, onJoin }: JoinOfferProps) {
  const { t } = useTranslation('playAgain');
  const { t: tj } = useTranslation('join');
  const { t: tc } = useTranslation();
  const title =
    host.kind === 'self'
      ? t('offer.titleSelf')
      : host.kind === 'named'
        ? t('offer.title', { name: host.name })
        : t('offer.titleNoName');

  useEffect(() => {
    if (arrived) AccessibilityInfo.announceForAccessibility(title);
    // Announced once, when the card arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const line = view.shuffling
    ? tj('shuffling')
    : view.message
      ? tj(view.message, view.params)
      : t('offer.body');
  const retry = view.button === 'retry';

  return (
    <Animated.View
      entering={arrived ? layout.toastIn : undefined}
      exiting={layout.fadeOut}
      className="gap-3 self-stretch rounded-lg border border-marquee-default bg-bg-surface p-4"
      testID="join-offer"
    >
      <View
        className="flex-row items-center gap-3"
        accessible
        accessibilityLabel={`${title}. ${line}`}
      >
        {host.kind === 'named' ? (
          <Avatar name={host.name} color={host.color} size="m" />
        ) : (
          <View className="size-10 items-center justify-center rounded-pill bg-bg-raised">
            <Icon name="ticket" size={24} color="marquee-default" />
          </View>
        )}
        <View className="flex-1 gap-0.5">
          <Text variant="body-m-strong" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="body-s" tone="secondary">
            {line}
          </Text>
        </View>
      </View>
      {view.button === 'hidden' ? null : (
        <Button
          label={retry ? tc('actions.retry') : t('offer.join')}
          accessibilityLabel={retry ? undefined : t('a11y.join')}
          variant="primary"
          size="l"
          block
          loading={view.button === 'loading'}
          onPress={onJoin}
        />
      )}
    </Animated.View>
  );
}

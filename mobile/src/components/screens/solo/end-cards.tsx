import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { Frame } from '@/components/screens/swipe/status-cards';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { SessionEntry } from '@/features/solo/session';

import { LikesFan } from './likes-fan';

// What takes the top card's place when a solo session has no card left (swipe.md#out-of-films and
// #the-cap-card): the films ran out, or the day's cards did. Calm: no haptic, no counter, no timer.

type Size = { width: number; height: number };

type EndCardProps = {
  size: Size;
  screenWidth: number;
  likes: readonly SessionEntry[];
  imageBase: string | undefined;
  onPick: () => void;
  onMyFilms: () => void;
  /** The cap card also offers hosting. */
  onHost?: () => void;
};

function EndCard({
  kind,
  size,
  screenWidth,
  likes,
  imageBase,
  onPick,
  onMyFilms,
  onHost,
}: EndCardProps & { kind: 'outOfFilms' | 'cap' }) {
  const { t } = useTranslation('solo');
  const count = likes.length;
  const title = kind === 'cap' ? t('cap.title') : t('outOfFilms.title');
  return (
    <Frame size={size}>
      <ScrollView contentContainerClassName="grow items-center justify-center gap-4 p-6">
        {kind === 'cap' ? <Icon name="ticket" size={32} color="text-muted" /> : null}
        <View accessible accessibilityRole="header" testID={`${kind}-title`}>
          <Text variant="display-s" align="center">
            {title}
          </Text>
        </View>
        {kind === 'cap' ? (
          <Text variant="body-m" tone="secondary" align="center">
            {t('cap.body')}
          </Text>
        ) : count === 0 ? (
          <Text variant="body-m" tone="secondary" align="center">
            {t('outOfFilms.body')}
          </Text>
        ) : null}
        {count > 0 ? (
          <>
            <LikesFan likes={likes} imageBase={imageBase} screenWidth={screenWidth} />
            <Text variant="title-m" align="center">
              {t('checkpoint.liked', { count })}
            </Text>
          </>
        ) : null}
        <View className="gap-3 self-stretch">
          {count > 0 ? (
            <Button
              label={t('checkpoint.pick')}
              variant="marquee"
              size="l"
              icon="ticket"
              block
              onPress={onPick}
            />
          ) : null}
          <Button
            label={t('actions.myFilms')}
            variant="secondary"
            size="l"
            block
            onPress={onMyFilms}
          />
          {onHost ? (
            <Button label={t('actions.host')} variant="secondary" size="l" block onPress={onHost} />
          ) : null}
        </View>
      </ScrollView>
    </Frame>
  );
}

/** `request_cards` answered `done` before the cap: every film of these filters was seen. */
export function OutOfFilmsCard(props: EndCardProps) {
  return <EndCard kind="outOfFilms" {...props} />;
}

/** `request_cards` answered `daily_limit` and the last card is gone. */
export function CapCard(props: EndCardProps) {
  return <EndCard kind="cap" {...props} />;
}

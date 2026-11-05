import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Poster } from '@/components/shared/poster';
import { Spotlight } from '@/components/ui/gradients';
import { Icon } from '@/components/ui/icon';
import { MarqueeBulbs } from '@/components/ui/marquee-bulbs';
import { Text } from '@/components/ui/text';

// The recap card (recap.md#the-card): a fixed 360 by 640 point image of tonight's pick, in the
// shape of a story. Nothing personal: no name, avatar, room code or service. Its type does not
// follow the phone's text size, since the card is an image.

export type RecapCardProps = {
  title: string;
  /** The poster at w342, or null when the film has none. */
  posterUri: string | null;
  thumbhash?: string;
  /** "3 min 42 s", or null when the room has no start or pick time. */
  time: string | null;
  people: number;
  swipes: number;
  /** The site's host, `flimme.com`. */
  site: string;
  language: string;
  /** The poster loaded or failed: the capture can go ahead. */
  onPosterSettled?: () => void;
};

export function RecapCard({
  title,
  posterUri,
  thumbhash,
  time,
  people,
  swipes,
  site,
  language,
  onPosterSettled,
}: RecapCardProps) {
  const { t } = useTranslation('recap');
  const number = new Intl.NumberFormat(language);
  return (
    <View
      className="h-160 w-90 justify-center gap-2.5 overflow-hidden rounded-xl border border-marquee-default bg-bg-canvas px-6 py-6"
      testID="recap-card"
    >
      <View className="absolute inset-x-0 top-16 aspect-square">
        <Spotlight tone="accent" />
      </View>
      <View className="items-center gap-2.5">
        <MarqueeBulbs count={11} />
        <Text variant="mono-eyebrow" tone="marquee" allowFontScaling={false}>
          {t('card.eyebrow')}
        </Text>
        <Text variant="display-m" tone="secondary" allowFontScaling={false}>
          {t('card.heading')}
        </Text>
        <View className="h-54 w-36 items-center justify-center overflow-hidden rounded-sm bg-bg-raised elevation-card">
          {posterUri ? (
            <Poster source={{ uri: posterUri }} thumbhash={thumbhash} onSettled={onPosterSettled} />
          ) : (
            <Icon name="film" size={40} color="text-muted" />
          )}
        </View>
        <Text
          variant="display-l"
          tone="marquee"
          align="center"
          numberOfLines={2}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {time ? (
          <Text variant="display-s" align="center" allowFontScaling={false}>
            {t('card.time', { time })}
          </Text>
        ) : null}
        <View className="flex-row gap-2 self-stretch">
          <View className="flex-1 items-center gap-1 rounded-md border border-border-default bg-bg-surface py-3">
            <Text variant="display-m" allowFontScaling={false}>
              {number.format(people)}
            </Text>
            <Text variant="mono-eyebrow" tone="muted" allowFontScaling={false}>
              {t('card.people', { count: people })}
            </Text>
          </View>
          <View className="flex-1 items-center gap-1 rounded-md border border-border-default bg-bg-surface py-3">
            <Text variant="display-m" allowFontScaling={false}>
              {number.format(swipes)}
            </Text>
            <Text variant="mono-eyebrow" tone="muted" allowFontScaling={false}>
              {t('card.swipes', { count: swipes })}
            </Text>
          </View>
        </View>
        <View className="h-px self-stretch bg-border-default" />
        <Text variant="mono-data" tone="muted" allowFontScaling={false}>
          {t('card.footer', { site })}
        </Text>
      </View>
    </View>
  );
}

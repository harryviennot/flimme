import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { track } from '@/lib/analytics';
import { duration } from '@/theme/motion';

// "Where to watch" (winner.md): the room's services that have the film, the JustWatch credit
// and TMDB's watch page as "More details". No link into a service's app (decision row 35).

function ServiceTile({ service }: { service: ServiceLogo }) {
  return (
    <View
      className="min-h-11 flex-row items-center gap-2 rounded-md border border-border-default bg-bg-raised px-3"
      testID="service-tile"
    >
      {service.logo ? (
        <View className="size-6 overflow-hidden rounded-xs">
          <Image
            source={{ uri: service.logo }}
            contentFit="cover"
            transition={duration.fast}
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        </View>
      ) : null}
      <Text variant="title-m" numberOfLines={1}>
        {service.name}
      </Text>
    </View>
  );
}

export type ServiceLogo = { id: number; name: string; logo?: string };

export type WhereToWatchProps = {
  services: readonly ServiceLogo[];
  /** TMDB's watch page for the film and country; null hides "More details". */
  watchLink: string | null;
  /** "Netflix and Canal+", read by a screen reader for the logos (the caller formats the list). */
  servicesLabel: string;
  /** The line when none of the player's services has the film (the room's, or the player's own). */
  notListed: string;
  /**
   * Whether "More details" is the group winner's event. A solo pick and the film sheet pass false:
   * `winner:watch_page_open` stays a group measure.
   */
  isGroupWinner?: boolean;
};

export function WhereToWatch({
  services,
  watchLink,
  servicesLabel,
  notListed,
  isGroupWinner = true,
}: WhereToWatchProps) {
  const { t } = useTranslation('winner');
  return (
    <View className="items-center gap-2 pt-2">
      <Text variant="mono-eyebrow" tone="secondary" accessibilityRole="header">
        {t('whereToWatch')}
      </Text>
      {services.length > 0 ? (
        <View
          className="flex-row flex-wrap justify-center gap-2"
          accessible
          accessibilityLabel={t('a11y.services', { names: servicesLabel })}
        >
          {services.map((service) => (
            <ServiceTile key={service.id} service={service} />
          ))}
        </View>
      ) : (
        <Text variant="body-m" tone="secondary" align="center">
          {notListed}
        </Text>
      )}
      <Text variant="body-s" tone="muted" align="center">
        {t('justwatch')}
      </Text>
      {watchLink ? (
        <View className="flex-row justify-center self-stretch">
          <Button
            label={t('moreDetails')}
            accessibilityLabel={t('a11y.moreDetails')}
            accessibilityHint={t('a11y.moreDetailsHint')}
            variant="ghost"
            size="s"
            icon="external-link"
            onPress={() => {
              if (isGroupWinner) track('winner:watch_page_open');
              void WebBrowser.openBrowserAsync(watchLink);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

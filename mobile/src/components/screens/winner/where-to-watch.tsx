import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { servicesLabel, type ServiceLogo } from '@/features/winner/services';
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
        <Image
          source={{ uri: service.logo }}
          transition={duration.fast}
          className="size-6 rounded-xs"
          accessible={false}
        />
      ) : null}
      <Text variant="title-m" numberOfLines={1}>
        {service.name}
      </Text>
    </View>
  );
}

export type WhereToWatchProps = {
  services: readonly ServiceLogo[];
  /** TMDB's watch page for the film and country; null hides "More details". */
  watchLink: string | null;
  language: string;
};

export function WhereToWatch({ services, watchLink, language }: WhereToWatchProps) {
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
          accessibilityLabel={t('a11y.services', { names: servicesLabel(services, language) })}
        >
          {services.map((service) => (
            <ServiceTile key={service.id} service={service} />
          ))}
        </View>
      ) : (
        <Text variant="body-m" tone="secondary" align="center">
          {t('notListed')}
        </Text>
      )}
      <Text variant="body-s" tone="muted" align="center">
        {t('justwatch')}
      </Text>
      {watchLink ? (
        <Button
          label={t('moreDetails')}
          accessibilityLabel={t('a11y.moreDetails')}
          accessibilityHint={t('a11y.moreDetailsHint')}
          variant="ghost"
          size="s"
          icon="external-link"
          onPress={() => void WebBrowser.openBrowserAsync(watchLink)}
        />
      ) : null}
    </View>
  );
}

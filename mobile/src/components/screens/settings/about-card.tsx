import * as Application from 'expo-application';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RatingLogo } from '@/components/shared/rating-logo';
import { Text } from '@/components/ui/text';

/**
 * What TMDB and JustWatch require us to show (tmdb.md#terms-licence-and-attribution): TMDB's
 * logo unmodified with its exact notice, the JustWatch credit, and the app's version.
 */
export function AboutCard() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const notice = t('about.tmdb');
  return (
    <View className="gap-3 p-4">
      <View
        accessible
        accessibilityLabel={t('a11y.tmdb', { notice })}
        className="flex-row items-center gap-3.5"
      >
        <RatingLogo source="tmdb" height={16} />
        <Text variant="body-s" tone="secondary" className="flex-1">
          {notice}
        </Text>
      </View>
      <Text variant="body-s" tone="muted">
        {tc('card.justwatch')}
      </Text>
      <Text variant="mono-data" tone="muted">
        {t('about.version', {
          version: Application.nativeApplicationVersion ?? '?',
          build: Application.nativeBuildVersion ?? '?',
        })}
      </Text>
    </View>
  );
}

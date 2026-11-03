import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MarqueeBulbs } from '@/components/ui/marquee-bulbs';
import { Text } from '@/components/ui/text';

/** The main path: open a room. */
export function HostCard() {
  const { t } = useTranslation('home');
  return (
    <View className="gap-3 rounded-lg border border-marquee-strong bg-bg-surface p-5">
      <MarqueeBulbs />
      <Text variant="display-m" accessibilityRole="header">
        {t('host.title')}
      </Text>
      <Text variant="body-m" tone="secondary">
        {t('host.body')}
      </Text>
      <Button
        label={t('host.cta')}
        size="l"
        icon="plus"
        block
        onPress={() => router.push('/host')}
      />
    </View>
  );
}

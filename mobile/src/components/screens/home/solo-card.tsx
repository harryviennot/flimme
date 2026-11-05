import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** The third path: swipe alone. At the daily cap the button still goes to setup, which shows the cap card. */
export function SoloCard() {
  const { t } = useTranslation('solo');
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
      <View className="min-w-40 flex-1 gap-1">
        <Text variant="display-s" accessibilityRole="header">
          {t('card.title')}
        </Text>
        <Text variant="body-s" tone="muted">
          {t('card.body')}
        </Text>
      </View>
      <Button
        label={t('card.cta')}
        variant="secondary"
        size="s"
        icon="user"
        onPress={() => router.push('/solo')}
      />
    </View>
  );
}

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** The second path: enter a code. */
export function JoinCard() {
  const { t } = useTranslation('home');
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
      <View className="flex-1 gap-1">
        <Text variant="display-s" accessibilityRole="header">
          {t('join.title')}
        </Text>
        <Text variant="body-s" tone="muted">
          {t('join.body')}
        </Text>
      </View>
      <Button
        label={t('join.cta')}
        variant="secondary"
        size="s"
        onPress={() => router.push('/join')}
      />
    </View>
  );
}

import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { reportError } from '@/lib/sentry';

/** Shown when a screen throws. Expo Router renders it in place of the broken route. */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  // Expo Router catches the error, so Sentry's wrapper never sees it.
  useEffect(() => reportError(error), [error]);
  return (
    <Screen footer={<Button label={t('actions.retry')} onPress={() => void retry()} />}>
      <View className="flex-1 justify-center gap-3">
        <Text variant="display-m">{t('errors.generic.title')}</Text>
        <Text tone="secondary">{t('errors.generic.body')}</Text>
      </View>
    </Screen>
  );
}

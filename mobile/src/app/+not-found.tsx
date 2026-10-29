import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Screen footer={<Button label={t('actions.back')} onPress={() => router.replace('/')} />}>
      <View className="flex-1 justify-center gap-3">
        <Text variant="display-m">{t('errors.notFound.title')}</Text>
        <Text tone="secondary">{t('errors.notFound.body')}</Text>
      </View>
    </Screen>
  );
}

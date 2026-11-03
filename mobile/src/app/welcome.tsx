import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Hero } from '@/components/screens/welcome/hero';
import { Promises } from '@/components/screens/welcome/promises';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  const { t } = useTranslation('onboarding');
  return (
    <Screen
      scroll
      footer={
        <View className="gap-2">
          <Button label={t('welcome.start')} size="l" block onPress={() => router.push('/name')} />
          <Button
            label={t('welcome.haveCode')}
            variant="ghost"
            size="l"
            block
            onPress={() => router.push('/join')}
          />
        </View>
      }
    >
      <View className="gap-5 pt-6 pb-4">
        <Hero />
        <View className="gap-2">
          <Text variant="display-l" accessibilityRole="header">
            {t('welcome.title')}
          </Text>
          <Text variant="body-l" tone="secondary">
            {t('welcome.body')}
          </Text>
        </View>
        <Promises />
      </View>
    </Screen>
  );
}

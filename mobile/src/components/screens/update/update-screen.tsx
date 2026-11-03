import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';

/** Full screen, replaces the app when this build is older than `min_app_version`. */
export function UpdateScreen({ onUpdate }: { onUpdate: () => void }) {
  const { t } = useTranslation('onboarding');
  return (
    <Screen>
      <View className="flex-1 justify-center">
        <EmptyState
          icon="arrow-up"
          title={t('splash.update.title')}
          body={t('splash.update.body')}
          action={{ label: t('splash.update.action'), onPress: onUpdate }}
        />
      </View>
    </Screen>
  );
}

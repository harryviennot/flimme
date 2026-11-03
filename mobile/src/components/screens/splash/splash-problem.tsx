import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';

export type SplashProblemProps = {
  kind: 'offline' | 'signInFailed';
  onRetry: () => void;
};

/** The splash when it can't go on: no connection, or the guest sign-in didn't work. */
export function SplashProblem({ kind, onRetry }: SplashProblemProps) {
  const { t } = useTranslation('onboarding');
  const { t: tc } = useTranslation('common');
  const offline = kind === 'offline';
  return (
    <Screen>
      <View className="flex-1 justify-center">
        <EmptyState
          icon={offline ? 'wifi-off' : 'alert'}
          error={!offline}
          autoFocus
          title={offline ? t('splash.offline.title') : t('splash.signInFailed.title')}
          body={offline ? t('splash.offline.body') : t('splash.signInFailed.body')}
          action={{ label: tc('actions.retry'), onPress: onRetry }}
        />
      </View>
    </Screen>
  );
}

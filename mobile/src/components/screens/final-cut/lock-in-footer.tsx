import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Phase } from '@/features/finale/phase';
import { layout } from '@/theme/motion';

// The footer (final-cut.md#locking-in): one of four looks in the same space, then the status line.
// Lock in, Sending, Locked in, Counting the votes. The height never changes.

export function LockInFooter({
  phase,
  status,
  onLockIn,
}: {
  phase: Phase;
  /** The status line's text, or an empty string. */
  status: string;
  onLockIn: () => void;
}) {
  const { t } = useTranslation('finale');
  return (
    <View className="gap-2 pt-3">
      {phase === 'locked' ? (
        <Animated.View
          entering={layout.fadeIn}
          accessible
          accessibilityLabel={t('locked.title')}
          testID="locked-in"
          className="mt-1 h-14 flex-row items-center justify-center gap-2.5 rounded-md border-2 border-like-default bg-like-soft"
        >
          <Icon name="check" size={20} color="like-default" />
          <Text variant="label-button-l" tone="like" numberOfLines={1}>
            {t('locked.title')}
          </Text>
        </Animated.View>
      ) : phase === 'counting' ? (
        <Animated.View
          entering={layout.fadeIn}
          accessible
          accessibilityRole="text"
          testID="counting"
          className="mt-1 h-14 items-center justify-center"
        >
          <Text variant="display-s" tone="marquee" align="center" numberOfLines={1}>
            {t('counting.title')}
          </Text>
        </Animated.View>
      ) : (
        <Button
          label={phase === 'sending' ? t('sending') : t('lockIn')}
          accessibilityHint={t('a11y.lockInHint')}
          icon={phase === 'sending' ? undefined : 'lock'}
          loading={phase === 'sending'}
          disabled={phase === 'loading'}
          block
          onPress={onLockIn}
        />
      )}
      <View className="min-h-4.5 items-center">
        <Text variant="body-s" tone="muted" align="center" testID="status-line">
          {status}
        </Text>
      </View>
    </View>
  );
}

import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useDeleteAccount } from '@/features/account/use-delete-account';
import { layout } from '@/theme/motion';

/**
 * The delete confirmation (settings.md, "The delete sheet"): one destructive button and a way
 * out. While a request runs the sheet can't be swiped away, so the answer always lands somewhere.
 * Status lines live here, not in toasts: the toast host sits under a native sheet.
 */
export function DeleteSheet() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const { status, offline, confirm } = useDeleteAccount();
  const deleting = status === 'deleting';
  // At the largest text sizes the sheet takes a tall detent, drops its icon and tightens up, so
  // the text and the two buttons fit (a ScrollView inside a formSheet draws nothing here).
  const { fontScale } = useWindowDimensions();
  const compact = fontScale > 1.3;

  const content = (
    <>
      {compact ? null : (
        <View className="size-16 items-center justify-center rounded-pill bg-nope-soft">
          <Icon name="alert" size={28} color="nope-text" />
        </View>
      )}
      <View accessible accessibilityRole="header">
        <Text variant="display-m" align="center">
          {t('delete.title')}
        </Text>
      </View>
      <Text variant="body-m" tone="secondary" align="center">
        {t('delete.body')}
      </Text>
      {offline && !deleting ? (
        <Animated.View entering={layout.fadeIn} accessibilityLiveRegion="polite">
          <Text variant="body-s" tone="muted" align="center">
            {t('delete.errors.offline')}
          </Text>
        </Animated.View>
      ) : status === 'try_again' ? (
        <Animated.View entering={layout.fadeIn} accessibilityLiveRegion="polite">
          <Text variant="body-s" tone="nope" align="center">
            {t('delete.errors.tryAgain')}
          </Text>
        </Animated.View>
      ) : null}
    </>
  );

  return (
    <View className={compact ? 'flex-1 bg-bg-canvas' : 'bg-bg-canvas'}>
      <Stack.Screen
        options={{
          gestureEnabled: !deleting,
          sheetAllowedDetents: compact ? [0.9] : 'fitToContents',
        }}
      />
      <View className={compact ? 'flex-1 items-center gap-3 p-4' : 'items-center gap-4 p-5'}>
        {content}
      </View>
      <View className="gap-3 px-5" style={{ paddingBottom: Math.max(insets.bottom, 20) }}>
        <Button
          label={t('delete.confirm')}
          variant="danger"
          size="l"
          icon="trash"
          block
          loading={deleting}
          disabled={offline}
          onPress={confirm}
        />
        <Button
          label={tc('actions.cancel')}
          variant="secondary"
          size="l"
          block
          disabled={deleting}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

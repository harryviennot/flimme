import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
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

  return (
    <View className="bg-bg-canvas">
      <Stack.Screen options={{ gestureEnabled: !deleting }} />
      <ScrollView
        contentContainerClassName="items-center gap-4 p-5"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="size-16 items-center justify-center rounded-pill bg-nope-soft">
          <Icon name="alert" size={28} color="nope-text" />
        </View>
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
      </ScrollView>
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

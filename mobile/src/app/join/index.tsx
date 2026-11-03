import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, View } from 'react-native';

import { CodeField } from '@/components/screens/join/code-field';
import { PasteButton } from '@/components/screens/join/paste-button';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { useJoinAttempt } from '@/features/join';

/** Join with a code: six digits, and the app joins as soon as the sixth is typed. */
export default function JoinScreen() {
  const { t } = useTranslation('join');
  const { t: tc } = useTranslation();
  const { code, view, shaking, error, setCode, paste, finishShake, retry } = useJoinAttempt();

  const status =
    view.kind === 'checking'
      ? t('checking')
      : view.kind === 'shuffling'
        ? t('shuffling')
        : view.kind === 'message'
          ? t(view.message, view.params)
          : '';

  // Screen readers on iOS don't read live regions: say the message when it appears.
  useEffect(() => {
    if (status && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(status);
  }, [status]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen header={<TopBar title={t('topBar')} onBack={() => router.back()} />}>
        <View className="gap-6 pt-4">
          <Text variant="display-l" accessibilityRole="header">
            {t('title')}
          </Text>
          <Text variant="body-m" tone="secondary">
            {t('body')}
          </Text>
          <CodeField
            code={code}
            onChangeCode={setCode}
            error={error}
            shaking={shaking}
            onShakeEnd={finishShake}
          />
          <View className="gap-3">
            <Text
              variant="body-s"
              tone={view.kind === 'message' ? 'nope' : 'muted'}
              accessibilityLiveRegion="polite"
              className="min-h-9"
            >
              {status}
            </Text>
            {code === '' ? <PasteButton onPaste={paste} /> : null}
            {view.kind === 'message' && view.next === 'host' ? (
              <Button
                label={t('actions.host')}
                variant="secondary"
                size="s"
                onPress={() => router.push('/host')}
              />
            ) : null}
            {view.kind === 'message' && view.next === 'retry' ? (
              <Button label={tc('actions.retry')} variant="secondary" size="s" onPress={retry} />
            ) : null}
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

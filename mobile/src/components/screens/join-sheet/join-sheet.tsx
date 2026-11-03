import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { NameForm } from '@/components/shared/name-form';
import { RoomTicket } from '@/components/shared/room-ticket';
import type { AvatarColor } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { showToast } from '@/components/ui/toast';
import { Text } from '@/components/ui/text';
import type { LinkView, NameError } from '@/features/join/use-join-link';
import { initialColor, isNameValid, type SubmitOutcome } from '@/features/profile';
import { layout } from '@/theme/motion';

export type JoinSheetProps = {
  view: LinkView;
  code: string;
  nameError: NameError | null;
  saving: boolean;
  onClearNameError: () => void;
  onRetry: () => void;
  onSubmit: (name: string, color: AvatarColor) => Promise<SubmitOutcome>;
};

/** The join sheet's three layouts: joining, first time, refused (join-sheet.md#layout). */
export function JoinSheet({ view, code, ...rest }: JoinSheetProps) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <View className="pt-8 pb-4">
          {view.kind === 'joining' ? <Joining code={code} shuffling={view.shuffling} /> : null}
          {view.kind === 'first-time' ? (
            <FirstTime code={code} hostName={view.hostName} {...rest} />
          ) : null}
          {view.kind === 'refused' ? <Refused view={view} onRetry={rest.onRetry} /> : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Joining({ code, shuffling }: { code: string; shuffling: boolean }) {
  const { t } = useTranslation('join');
  return (
    <View className="gap-6">
      <RoomTicket
        code={code}
        leftDetail={t('link.ticketLeft')}
        rightDetail={t('link.ticketRight')}
      />
      <Text variant="body-m" tone="secondary" align="center" accessibilityLiveRegion="polite">
        {shuffling ? t('shuffling') : t('link.joining')}
      </Text>
    </View>
  );
}

function FirstTime({
  code,
  hostName,
  nameError,
  saving,
  onClearNameError,
  onSubmit,
}: Omit<JoinSheetProps, 'view'> & { hostName: string | null }) {
  const { t } = useTranslation('join');
  const { t: tn } = useTranslation('onboarding');
  const { t: tc } = useTranslation();
  const [name, setName] = useState('');
  const [color, setColor] = useState<AvatarColor>(() =>
    initialColor(false, 'default', Math.random),
  );
  const [autoFocus, setAutoFocus] = useState(false);

  // Focused on open, unless a screen reader is on, so the title is read first.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => alive && setAutoFocus(!on))
      .catch(() => alive && setAutoFocus(true));
    return () => {
      alive = false;
    };
  }, []);

  const valid = isNameValid(name);
  const join = async () => {
    if (!valid || saving) return;
    const outcome = await onSubmit(name, color);
    if (outcome.kind === 'offline') showToast({ tone: 'warn', title: tn('name.errors.offline') });
    else if (outcome.kind === 'failed')
      showToast({ tone: 'warn', title: tc('errors.generic.title') });
  };

  return (
    <Animated.View entering={layout.fadeIn} className="gap-5">
      <Text variant="mono-eyebrow" tone="marquee">
        {t('link.code', { code })}
      </Text>
      <Text variant="display-m" accessibilityRole="header">
        {hostName ? t('link.titleHost', { name: hostName }) : t('link.title')}
      </Text>
      <NameForm
        name={name}
        color={color}
        error={nameError ? tn(`name.errors.${nameError}`) : undefined}
        onChangeName={(next) => {
          setName(next);
          onClearNameError();
        }}
        onChangeColor={setColor}
        autoFocus={autoFocus}
      />
      <Button
        label={t('link.join')}
        size="l"
        block
        disabled={!valid}
        loading={saving}
        onPress={() => void join()}
      />
    </Animated.View>
  );
}

function Refused({
  view,
  onRetry,
}: {
  view: Extract<LinkView, { kind: 'refused' }>;
  onRetry: () => void;
}) {
  const { t } = useTranslation('join');
  const { t: tc } = useTranslation();
  const { row } = view;
  return (
    <Animated.View entering={layout.fadeIn}>
      <EmptyState
        icon={row.icon}
        title={t(view.message, view.params)}
        error={row.error}
        autoFocus
      />
      <View className="gap-2">
        {row.next === 'retry' ? (
          <Button label={tc('actions.retry')} size="l" block onPress={onRetry} />
        ) : null}
        {row.next === 'host' ? (
          <Button
            label={t('actions.host')}
            variant="secondary"
            size="l"
            block
            onPress={() => router.replace('/host')}
          />
        ) : null}
        {row.next !== 'auto' ? (
          <Button
            label={t('link.anotherCode')}
            variant="ghost"
            size="l"
            block
            onPress={() => router.replace('/join')}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

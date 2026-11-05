import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, View } from 'react-native';

import { api } from '@/api';
import { NameForm } from '@/components/shared/name-form';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { showToast } from '@/components/ui/toast';
import { TopBar } from '@/components/ui/top-bar';
import { Text } from '@/components/ui/text';
import type { AvatarColor } from '@/components/ui/avatar';
import { useOnline } from '@/features/network';
import {
  applySavedProfile,
  initialColor,
  isNameValid,
  submitName,
  useMyProfile,
} from '@/features/profile';
import { haptics } from '@/lib/haptics';
import { trackNameSubmit } from '@/features/analytics/events';

type NameError = 'invalid' | 'notAllowed';

/** Name and color: Welcome's Get started, a code that needs a name, and Home's avatar. */
export default function NameScreen() {
  const { t } = useTranslation('onboarding');
  const { t: tc } = useTranslation();
  const params = useLocalSearchParams<{ code?: string; edit?: string }>();
  const editing = params.edit === '1';
  const backToCode = typeof params.code === 'string' && params.code.length > 0;

  const client = useQueryClient();
  const online = useOnline();
  const profile = useMyProfile().data;

  const [name, setName] = useState(editing ? (profile?.display_name ?? '') : '');
  const [color, setColor] = useState<AvatarColor>(() =>
    initialColor(editing, profile?.avatar_key ?? 'default', Math.random),
  );
  const [error, setError] = useState<NameError | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoFocus, setAutoFocus] = useState(false);
  const touched = useRef(false);
  // Whether the player chose a color themselves, not the one drawn for them.
  const pickedColor = useRef(false);

  // Editing from a cold cache: fill the fields in once the profile arrives, if untouched.
  useEffect(() => {
    if (!editing || !profile || touched.current) return;
    setName(profile.display_name);
    setColor(initialColor(true, profile.avatar_key, Math.random));
  }, [editing, profile]);

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

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    const outcome = await submitName(name, color, {
      online,
      updateProfile: (args) => api.updateProfile(args),
    });
    setSaving(false);
    switch (outcome.kind) {
      case 'saved':
        applySavedProfile(client, outcome);
        // Home's avatar edit is not onboarding; a name asked by a code (an invite) is.
        trackNameSubmit({
          editing,
          hasAvatar: pickedColor.current,
          source: backToCode ? 'invite' : 'organic',
        });
        if (editing || backToCode) {
          router.back();
        } else {
          // Home becomes the only screen: back from Home never returns to Welcome or here.
          if (router.canDismiss()) router.dismissAll();
          router.replace('/home');
        }
        return;
      case 'invalid':
      case 'notAllowed':
        setError(outcome.kind);
        haptics.error();
        return;
      case 'offline':
        showToast({ tone: 'warn', title: t('name.errors.offline') });
        return;
      case 'failed':
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return;
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll
        header={<TopBar title={t('name.topBar')} onBack={() => router.back()} />}
        footer={
          <Button
            label={t('name.continue')}
            size="l"
            block
            disabled={!valid}
            loading={saving}
            accessibilityHint={valid ? undefined : t('name.helper')}
            onPress={() => void save()}
          />
        }
      >
        <View className="gap-6 pt-4 pb-4">
          <Text variant="display-l" accessibilityRole="header">
            {t('name.title')}
          </Text>
          <NameForm
            name={name}
            color={color}
            error={error ? t(`name.errors.${error}`) : undefined}
            onChangeName={(next) => {
              touched.current = true;
              setName(next);
              setError(null);
            }}
            onChangeColor={(next) => {
              touched.current = true;
              pickedColor.current = true;
              setColor(next);
            }}
            autoFocus={autoFocus}
          />
          <Text variant="body-s" tone="muted">
            {t('name.note')}
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

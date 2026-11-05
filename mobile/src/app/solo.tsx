import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { api } from '@/api';
import { ServiceGrid } from '@/components/shared/service-grid';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { TopBar } from '@/components/ui/top-bar';
import { MY_PROVIDERS_KEY } from '@/features/host/queries';
import {
  AGE_CHOICES,
  TIME_CHOICES,
  type AgeChoice,
  type TimeChoice,
} from '@/features/host/settings';
import { useSetupForm } from '@/features/host/use-setup-form';
import { keptRoomId, leaveOldSeat } from '@/features/join/old-seat';
import { useOnline } from '@/features/network';
import { markCapReached, useCapToday } from '@/features/solo/cap';
import { startSoloGame } from '@/features/solo/start';
import { haptics } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';
import { layout } from '@/theme/motion';
import Animated from 'react-native-reanimated';

/** Play alone setup (solo-setup.md): the services, time budget and age cap, then Start. */
export default function SoloSetupScreen() {
  const { t } = useTranslation('solo');
  const { t: th } = useTranslation('host');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const form = useSetupForm();
  const { profile, country, providers, listed, selection, ready, failed } = form;
  const { toggle, time, setTime, age, setAge, retry } = form;
  const capToday = useCapToday();

  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState(false);
  const [capHit, setCapHit] = useState(false);
  const [tooFew, setTooFew] = useState<number | null>(null);
  const busy = useRef(false);

  const unsupported =
    (!profile.isPending && !country) || refused || (providers.isSuccess && listed.length === 0);
  const canStart = ready && selection.length > 0 && online && !starting;

  const begin = async () => {
    if (busy.current || !canStart) return;
    busy.current = true;
    // The kept room now, before the call, as host setup does.
    const oldRoomId = keptRoomId();
    setStarting(true);
    setTooFew(null);
    const outcome = await startSoloGame(
      { selection, changed: form.changed, settings: form.settings },
      {
        setMyProviders: (args) => api.setMyProviders(args),
        startSolo: (args) => api.startSolo(args),
      },
    );
    // On success the button stays busy until the screen is left.
    if (outcome.kind !== 'started') {
      busy.current = false;
      setStarting(false);
    }
    switch (outcome.kind) {
      case 'started':
        client.setQueryData(MY_PROVIDERS_KEY, selection);
        leaveOldSeat(outcome.roomId, oldRoomId);
        router.replace(`/room/${outcome.roomId}/swipe`);
        return;
      case 'too_few':
        setTooFew(outcome.eligible);
        haptics.error();
        return;
      case 'cap':
        markCapReached();
        setCapHit(true);
        return;
      case 'name_required':
        router.push('/name?edit=1');
        return;
      case 'unsupported':
        setRefused(true);
        return;
      case 'rate_limited':
        showToast({ tone: 'warn', title: t('setup.errors.rateLimited') });
        return;
      case 'bug':
        reportError(new Error(`solo setup: ${outcome.reason}`));
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return;
      case 'network':
        showToast({ tone: 'warn', title: t('setup.errors.network') });
        haptics.error();
        return;
    }
  };

  const header = <TopBar title={t('setup.topBar')} onBack={() => router.back()} />;

  if (capToday || capHit) {
    return (
      <Screen
        header={header}
        footer={
          <View className="gap-3">
            <Button
              label={t('actions.host')}
              icon="plus"
              size="l"
              block
              onPress={() => router.replace('/host')}
            />
            <Button
              label={t('actions.myFilms')}
              variant="secondary"
              size="l"
              block
              onPress={() => router.dismissTo('/my-films')}
            />
          </View>
        }
      >
        <Animated.View entering={layout.fadeIn} className="flex-1 justify-center">
          <EmptyState icon="ticket" title={t('cap.title')} body={t('cap.body')} autoFocus />
          {online ? null : <Banner tone="warn" message={t('setup.offline')} />}
        </Animated.View>
      </Screen>
    );
  }

  if (unsupported) {
    return (
      <Screen header={header}>
        <EmptyState
          icon="globe"
          title={th('errors.unsupported.title')}
          body={th('errors.unsupported.body')}
          action={{ label: th('errors.unsupported.action'), onPress: () => router.push('/join') }}
        />
      </Screen>
    );
  }

  const timeLabels: Record<TimeChoice, string> = {
    any: th('time.any'),
    under105: th('time.under105'),
    under120: th('time.under120'),
  };
  const ageLabels: Record<AgeChoice, string> = {
    adults: th('age.adults'),
    '16': th('age.years', { age: 16 }),
    '12': th('age.years', { age: 12 }),
    '10': th('age.years', { age: 10 }),
    all: th('age.all'),
  };
  const disabledReason = selection.length === 0 ? th('services.required') : undefined;

  return (
    <Screen
      scroll
      header={header}
      footer={
        <View className="gap-2">
          <Button
            label={t('setup.start')}
            icon="play"
            size="l"
            block
            disabled={!canStart}
            loading={starting}
            accessibilityHint={disabledReason}
            onPress={() => void begin()}
          />
          {ready && disabledReason ? (
            <Text variant="body-s" tone="muted" align="center">
              {disabledReason}
            </Text>
          ) : null}
          {tooFew !== null ? (
            <Text variant="body-s" tone="nope" align="center" accessibilityLiveRegion="assertive">
              {tooFew === 0 ? t('setup.tooFewNone') : t('setup.tooFew', { count: tooFew })}
            </Text>
          ) : null}
        </View>
      }
    >
      <View className="gap-6 pt-4 pb-4">
        {online ? null : <Banner tone="warn" message={t('setup.offline')} />}
        <Text variant="display-m" accessibilityRole="header">
          {t('setup.title')}
        </Text>

        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('setup.services')}
          </Text>
          {failed ? (
            <EmptyState
              icon="alert"
              error
              title={th('errors.services')}
              action={{ label: tc('actions.retry'), onPress: retry }}
            />
          ) : (
            <ServiceGrid
              loading={!ready}
              services={listed.map((p) => ({ id: p.provider_id, name: p.name }))}
              selected={selection}
              onToggle={(id) => {
                setTooFew(null);
                toggle(id);
              }}
            />
          )}
          <Text variant="body-s" tone="muted">
            {th('services.free')}
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {th('time.label')}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={th('time.label')}
            className="flex-row flex-wrap gap-2"
          >
            {TIME_CHOICES.map((choice) => (
              <Chip
                key={choice}
                role="radio"
                label={timeLabels[choice]}
                selected={time === choice}
                onPress={() => {
                  setTooFew(null);
                  setTime(choice);
                }}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {th('age.label')}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={th('age.label')}
            className="flex-row flex-wrap gap-2"
          >
            {AGE_CHOICES.map((choice) => (
              <Chip
                key={choice}
                role="radio"
                label={ageLabels[choice]}
                selected={age === choice}
                onPress={() => {
                  setTooFew(null);
                  setAge(choice);
                }}
              />
            ))}
          </View>
          <Text variant="body-s" tone="muted">
            {th('age.helper')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

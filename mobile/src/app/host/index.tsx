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
import { showToast } from '@/components/ui/toast';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { keptRoomId, leaveOldSeat } from '@/features/join/old-seat';
import { openRoom } from '@/features/host/open-room';
import { MY_PROVIDERS_KEY } from '@/features/host/queries';
import {
  AGE_CHOICES,
  TIME_CHOICES,
  selectionChanged,
  toRoomSettings,
  type AgeChoice,
  type TimeChoice,
} from '@/features/host/settings';
import { useSetupForm } from '@/features/host/use-setup-form';
import { useOnline } from '@/features/network';
import { trackRoomCreated } from '@/features/analytics/events';
import { haptics } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';

/** Host setup (host-setup.md): the room's services, time budget and age cap, then Open the room. */
export default function HostScreen() {
  const { t } = useTranslation('host');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const form = useSetupForm();
  const { profile, country, providers, listed, start, selection, ready, failed } = form;
  const { toggle, time, setTime, age, setAge, retry } = form;

  const [opening, setOpening] = useState(false);
  const [refused, setRefused] = useState(false);
  const busy = useRef(false);

  const unsupported =
    (!profile.isPending && !country) || refused || (providers.isSuccess && listed.length === 0);

  const canOpen = ready && selection.length > 0 && online && !opening;

  const open = async () => {
    if (busy.current || !canOpen) return;
    busy.current = true;
    // The kept room now, before the call: the new room's layout overwrites it once mounted.
    const oldRoomId = keptRoomId();
    setOpening(true);
    const outcome = await openRoom(
      {
        selection,
        changed: selectionChanged(start, selection),
        settings: toRoomSettings(time, age),
      },
      {
        setMyProviders: (args) => api.setMyProviders(args),
        createRoom: (args) => api.createRoom(args),
      },
    );
    // On success the button stays busy until the screen is left.
    if (outcome.kind !== 'opened') {
      busy.current = false;
      setOpening(false);
    }
    switch (outcome.kind) {
      case 'opened': {
        // The room's cap isn't read yet: both events wait for the room layout (kids' rule).
        trackRoomCreated({
          serviceCount: selection.length,
          runtimeMax: toRoomSettings(time, age).runtime_max,
        });
        client.setQueryData(MY_PROVIDERS_KEY, selection);
        leaveOldSeat(outcome.roomId, oldRoomId);
        router.replace(`/room/${outcome.roomId}/lobby`);
        return;
      }
      case 'name_required':
        router.push('/name?edit=1');
        return;
      case 'unsupported':
        setRefused(true);
        return;
      case 'bug':
        // The picker can't cause these: a toast for the host, and a report for us (no ids).
        reportError(new Error(`host setup: ${outcome.reason}`));
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return;
      case 'network':
        showToast({ tone: 'warn', title: t('errors.network') });
        haptics.error();
        return;
    }
  };

  const header = <TopBar title={t('topBar')} onBack={() => router.back()} />;

  if (unsupported) {
    return (
      <Screen header={header}>
        <EmptyState
          icon="globe"
          title={t('errors.unsupported.title')}
          body={t('errors.unsupported.body')}
          action={{ label: t('errors.unsupported.action'), onPress: () => router.push('/join') }}
        />
      </Screen>
    );
  }

  const timeLabels: Record<TimeChoice, string> = {
    any: t('time.any'),
    under105: t('time.under105'),
    under120: t('time.under120'),
  };
  const ageLabels: Record<AgeChoice, string> = {
    adults: t('age.adults'),
    '16': t('age.years', { age: 16 }),
    '12': t('age.years', { age: 12 }),
    '10': t('age.years', { age: 10 }),
    all: t('age.all'),
  };

  const disabledReason = selection.length === 0 ? t('services.required') : undefined;

  return (
    <Screen
      scroll
      header={header}
      footer={
        <View className="gap-2">
          <Button
            label={t('open')}
            icon="ticket"
            size="l"
            block
            disabled={!canOpen}
            loading={opening}
            accessibilityHint={disabledReason}
            onPress={() => void open()}
          />
          {ready && disabledReason ? (
            <Text variant="body-s" tone="muted" align="center">
              {disabledReason}
            </Text>
          ) : null}
        </View>
      }
    >
      <View className="gap-6 pt-4 pb-4">
        {online ? null : <Banner tone="warn" message={t('offline')} />}
        <Text variant="display-m" accessibilityRole="header">
          {t('title')}
        </Text>

        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('services.label')}
          </Text>
          <Text variant="body-s" tone="muted">
            {t('services.helper')}
          </Text>
          {failed ? (
            <EmptyState
              icon="alert"
              error
              title={t('errors.services')}
              action={{ label: tc('actions.retry'), onPress: retry }}
            />
          ) : (
            <ServiceGrid
              loading={!ready}
              services={listed.map((p) => ({ id: p.provider_id, name: p.name }))}
              selected={selection}
              onToggle={toggle}
            />
          )}
          <Text variant="body-s" tone="muted">
            {t('services.free')}
          </Text>
        </View>

        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('time.label')}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('time.label')}
            className="flex-row flex-wrap gap-2"
          >
            {TIME_CHOICES.map((choice) => (
              <Chip
                key={choice}
                role="radio"
                label={timeLabels[choice]}
                selected={time === choice}
                onPress={() => setTime(choice)}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('age.label')}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('age.label')}
            className="flex-row flex-wrap gap-2"
          >
            {AGE_CHOICES.map((choice) => (
              <Chip
                key={choice}
                role="radio"
                label={ageLabels[choice]}
                selected={age === choice}
                onPress={() => setAge(choice)}
              />
            ))}
          </View>
          <Text variant="body-s" tone="muted">
            {t('age.helper')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

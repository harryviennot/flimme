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
import { openRoom } from '@/features/host/open-room';
import { MY_PROVIDERS_KEY, useCountryProviders, useMyProviders } from '@/features/host/queries';
import {
  AGE_CHOICES,
  DEFAULT_AGE,
  DEFAULT_TIME,
  TIME_CHOICES,
  initialSelection,
  selectionChanged,
  toRoomSettings,
  type AgeChoice,
  type TimeChoice,
} from '@/features/host/settings';
import { useOnline } from '@/features/network';
import { useMyProfile } from '@/features/profile';
import { haptics } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';

/** Host setup (host-setup.md): the room's services, time budget and age cap, then Open the room. */
export default function HostScreen() {
  const { t } = useTranslation('host');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const profile = useMyProfile();
  const country = profile.data?.country ?? null;

  const providers = useCountryProviders(country);
  const mine = useMyProviders(Boolean(country));

  // The host's own taps; until they tap, the selection is the start (saved ids the country lists).
  const [picked, setPicked] = useState<number[] | null>(null);
  const [time, setTime] = useState<TimeChoice>(DEFAULT_TIME);
  const [age, setAge] = useState<AgeChoice>(DEFAULT_AGE);
  const [opening, setOpening] = useState(false);
  const [refused, setRefused] = useState(false);
  const busy = useRef(false);

  const listed = providers.data ?? [];
  const start = initialSelection(
    mine.data ?? [],
    listed.map((p) => p.provider_id),
  );
  const selection = picked ?? start;
  const ready = providers.isSuccess && mine.isSuccess;
  const failed = providers.isError || mine.isError;
  const unsupported =
    (!profile.isPending && !country) || refused || (providers.isSuccess && listed.length === 0);

  const toggle = (id: number) =>
    setPicked(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);

  const canOpen = ready && selection.length > 0 && online && !opening;

  const open = async () => {
    if (busy.current || !canOpen) return;
    busy.current = true;
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
      case 'opened':
        client.setQueryData(MY_PROVIDERS_KEY, selection);
        router.replace(`/room/${outcome.roomId}/lobby`);
        router.push(`/room/${outcome.roomId}/invite`);
        return;
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

  const retry = () => {
    void providers.refetch();
    void mine.refetch();
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

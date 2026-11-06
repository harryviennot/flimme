import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { api } from '@/api';
import { ServiceGrid } from '@/components/shared/service-grid';
import { useGridServices } from '@/features/services/use-grid-services';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { initialSelection } from '@/features/host/settings';
import { MY_PROVIDERS_KEY, useCountryProviders } from '@/features/host/queries';
import { saveServices } from '@/features/lobby/save-services';
import { SEATS_KEY, useMySeat, useRoom } from '@/features/room';
import { trackServicesSaved } from '@/features/analytics/events';
import { reportError } from '@/lib/sentry';

/** The player's services for this room (lobby.md#the-services-sheet-done), over the lobby. */
export default function RoomServicesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const room = useRoom(id).data;
  const seat = useMySeat(id);
  const providers = useCountryProviders(room?.country);
  const listed = providers.data ?? [];
  const gridItems = useGridServices(listed);

  // Starts on the seat's services that the country lists; the player's taps replace it.
  const start = initialSelection(
    seat?.provider_ids ?? [],
    listed.map((p) => p.provider_id),
  );
  const [picked, setPicked] = useState<number[] | null>(null);
  const selection = picked ?? start;
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const ready = providers.isSuccess && seat !== null;

  const toggle = (provider: number) =>
    setPicked(
      selection.includes(provider)
        ? selection.filter((x) => x !== provider)
        : [...selection, provider],
    );

  const done = async () => {
    if (busy.current || !ready) return;
    busy.current = true;
    setSaving(true);
    const outcome = await saveServices(
      { roomId: id ?? '', selection, start },
      {
        setMyProviders: (args) => api.setMyProviders(args),
        setSeatPrefs: (args) => api.setSeatPrefs(args),
      },
    );
    busy.current = false;
    setSaving(false);
    switch (outcome.kind) {
      case 'close':
        trackServicesSaved(start, selection);
        client.setQueryData(MY_PROVIDERS_KEY, selection);
        void client.invalidateQueries({ queryKey: SEATS_KEY(id ?? '') });
        router.back();
        return;
      case 'bug':
        reportError(new Error(`services sheet: ${outcome.reason}`));
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return;
      case 'failed':
        showToast({ tone: 'warn', title: t('errors.services') });
        return;
    }
  };

  return (
    <Screen
      scroll
      footer={
        <Button
          label={t('servicesSheet.done')}
          size="l"
          block
          disabled={!ready}
          loading={saving}
          onPress={() => void done()}
        />
      }
    >
      <View className="gap-4 pt-8 pb-4">
        <View accessible accessibilityRole="header">
          <Text variant="display-s">{t('servicesSheet.title')}</Text>
        </View>
        <Text variant="body-s" tone="muted">
          {t('servicesSheet.helper')}
        </Text>
        <ServiceGrid loading={!ready} services={gridItems} selected={selection} onToggle={toggle} />
      </View>
    </Screen>
  );
}

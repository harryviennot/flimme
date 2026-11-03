import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';

import { api } from '@/api';
import { SheetFrame } from '@/components/screens/room/sheet-frame';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { runRemove } from '@/features/lobby/host-actions';
import { useOnline } from '@/features/network';
import { useCountryProviders } from '@/features/host/queries';
import { formatList, serviceNames } from '@/features/lobby/names';
import { toAvatarColor } from '@/features/profile';
import {
  ROOM_KEY,
  SEATS_KEY,
  useMySeat,
  useRoom,
  useRoomPresence,
  useRoomSeats,
} from '@/features/room';

/**
 * The seat sheet (docs/design/screens/host-menu.md#the-seat-sheet): what a player can do about
 * another seat. Remove above Report for the host, Report for everyone.
 */
export default function RoomSeatSheet() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const { t, i18n } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const connected = useOnline();
  const me = useMySeat(id);
  const [removing, setRemoving] = useState(false);
  const busy = useRef(false);
  const room = useRoom(id).data;
  const seats = useRoomSeats(id);
  const { online, away } = useRoomPresence(id);
  const providers = useCountryProviders(room?.country).data;

  const seat = seats.data?.find((s) => s.member_id === memberId);
  const gone = seats.isSuccess && (!seat || seat.left_at !== null);
  // The seat leaves or is removed while the sheet is open: it closes by itself.
  useEffect(() => {
    if (gone) router.back();
  }, [gone]);

  if (!seat) return null;

  const remove = async () => {
    if (busy.current) return;
    if (!connected) {
      showToast({ tone: 'warn', title: tc('states.offlineRoom') });
      return;
    }
    busy.current = true;
    setRemoving(true);
    const outcome = await runRemove(api.removeMember, {
      roomId: id ?? '',
      memberId: seat.member_id,
    });
    busy.current = false;
    setRemoving(false);
    if (outcome.kind === 'failed') {
      showToast({ tone: 'warn', title: t('errors.remove') });
      return;
    }
    void client.invalidateQueries({
      queryKey: outcome.kind === 'seats' ? SEATS_KEY(id ?? '') : ROOM_KEY(id ?? ''),
      exact: outcome.kind === 'room',
    });
    router.back();
  };
  const confirmRemove = () =>
    Alert.alert(
      t('remove.title', { name: seat.display_name }),
      t('remove.body', { name: seat.display_name }),
      [
        { text: tc('actions.cancel'), style: 'cancel' },
        { text: t('remove.confirm'), style: 'destructive', onPress: () => void remove() },
      ],
    );

  const names = formatList(serviceNames(seat.provider_ids, providers), i18n.language);
  const isAway = away.has(seat.member_id);
  const subtitle = [names || t('seat.noServices'), isAway ? t('seat.away') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <SheetFrame onClose={() => router.back()}>
      <View className="gap-3 pb-2">
        <View className="flex-row items-center gap-3.5">
          <Avatar
            name={seat.display_name}
            color={toAvatarColor(seat.avatar_key)}
            size="m"
            online={online.has(seat.member_id) && !isAway}
          />
          <View className="min-w-0 flex-1 gap-0.5" accessible accessibilityRole="header">
            <Text variant="title-m" numberOfLines={2}>
              {seat.display_name}
            </Text>
            <Text variant="mono-data" tone="muted" numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          {seat.role === 'host' ? <Tag label={t('seat.host')} tone="marquee" icon="crown" /> : null}
        </View>
        {me?.role === 'host' ? (
          <Button
            label={t('seatSheet.remove')}
            accessibilityLabel={t('a11y.remove', { name: seat.display_name })}
            icon="ban"
            variant="danger"
            size="l"
            block
            loading={removing}
            disabled={!connected}
            onPress={confirmRemove}
          />
        ) : null}
        <Button
          label={t('seatSheet.report')}
          accessibilityLabel={t('a11y.report', { name: seat.display_name })}
          icon="shield"
          variant="secondary"
          size="l"
          block
          disabled={removing}
          onPress={() => router.replace(`/room/${id}/report/${seat.member_id}`)}
        />
      </View>
    </SheetFrame>
  );
}

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SheetFrame } from '@/components/screens/room/sheet-frame';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { useCountryProviders } from '@/features/host/queries';
import { formatList, serviceNames } from '@/features/lobby/names';
import { toAvatarColor } from '@/features/profile';
import { useRoom, useRoomPresence, useRoomSeats } from '@/features/room';

/**
 * The seat sheet (docs/design/screens/host-menu.md#the-seat-sheet): what a player can do about
 * another seat. Report for everyone; M4.13 adds Remove above it for the host.
 */
export default function RoomSeatSheet() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const { t, i18n } = useTranslation('lobby');
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
        {/* M4.13: the host's Remove button goes here, above Report. */}
        <Button
          label={t('seatSheet.report')}
          accessibilityLabel={t('a11y.report', { name: seat.display_name })}
          icon="shield"
          variant="secondary"
          size="l"
          block
          onPress={() => router.replace(`/room/${id}/report/${seat.member_id}`)}
        />
      </View>
    </SheetFrame>
  );
}

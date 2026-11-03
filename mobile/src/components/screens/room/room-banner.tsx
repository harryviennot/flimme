import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { useRoomConnection } from '@/features/room';

/**
 * The room's connection banner (reconnecting.md). Each room screen places it directly under its
 * `TopBar`; it shows one message at a time, offline first, or nothing.
 */
export function RoomBanner({ roomId }: { roomId: string }) {
  const { t } = useTranslation('common');
  const { banner } = useRoomConnection(roomId);
  const shown = banner !== null;

  // Screen readers on iOS don't read live regions: say it once when the banner appears, not
  // again when its message changes on a retry.
  const message = banner ? t(`states.${banner === 'offline' ? 'offlineRoom' : banner}`) : '';
  useEffect(() => {
    if (shown && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [shown]);

  if (!banner) return null;
  return <Banner tone="warn" message={message} />;
}

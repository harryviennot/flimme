import { useEffect } from 'react';

import { analytics } from '@/lib/analytics';

/**
 * Tells analytics which room the phone is in, from the room layout. Until the room is read its cap
 * is unknown, and nothing leaves; leaving the room (the layout unmounting) lifts the rule
 * (analytics.md#kids).
 */
export function useRoomCap(room: { max_age: number | null } | null | undefined): void {
  const known = room !== null && room !== undefined;
  const maxAge = room?.max_age ?? null;
  useEffect(() => {
    analytics.setRoomCap(known ? maxAge : 'unknown');
  }, [known, maxAge]);
  useEffect(() => () => analytics.clearRoomCap(), []);
}

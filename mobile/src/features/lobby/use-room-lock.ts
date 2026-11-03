import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';
import { runSetLocked } from '@/features/lobby/host-actions';
import { useOnline } from '@/features/network';
import { ROOM_KEY, useRoom } from '@/features/room';

/**
 * The room's lock for the lobby's row and the invite sheet (host-menu.md#lock-room). The value
 * follows the tap at once and is given back to the room read when the answer has been re-read,
 * so a failed call flips the toggle back.
 */
export function useRoomLock(roomId: string | undefined): {
  locked: boolean;
  /** A call is in flight, or the phone is offline: the control is disabled. */
  disabled: boolean;
  set: (locked: boolean) => Promise<void>;
} {
  const { t } = useTranslation('lobby');
  const client = useQueryClient();
  const online = useOnline();
  const room = useRoom(roomId).data;
  const [pending, setPending] = useState<boolean | null>(null);

  const set = async (next: boolean) => {
    if (!roomId || pending !== null || !online) return;
    setPending(next);
    const outcome = await runSetLocked(api.setRoomLocked, { roomId, locked: next });
    if (outcome.kind === 'failed') showToast({ tone: 'warn', title: t('errors.lock') });
    else await client.invalidateQueries({ queryKey: ROOM_KEY(roomId), exact: true });
    setPending(null);
  };

  return { locked: pending ?? room?.locked ?? false, disabled: pending !== null || !online, set };
}

import type { RoomState } from '@flimme/contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';
import { ROOM_KEY, useExitRoomToHome, useRoom } from '@/features/room';
import { pickOf } from '@/features/winner/pick';

import { isLeavingSolo } from './leave';
import { forgetSoloSession } from './session';

/** The deck isn't dealt: after this long the phone asks the server to deal (as the lobby's host does). */
export const DEAL_FALLBACK_MS = 8000;

/** Whether the room is a solo room (`api.rooms.mode`); false while the room is unknown. */
export function useIsSolo(roomId: string | undefined): boolean {
  return useRoom(roomId).data?.mode === 'solo';
}

/** A solo room that stays `dealing`: calls `api.start_game` once after 8 seconds (solo-setup.md). */
export function useSoloDealFallback(roomId: string, state: RoomState | undefined, solo: boolean) {
  useEffect(() => {
    if (!solo || state !== 'dealing') return;
    const timer = setTimeout(() => {
      void api.startGame({ room_id: roomId }).catch(() => {});
    }, DEAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [roomId, state, solo]);
}

/**
 * A solo room that ended (`done` or `abandoned`): with a pick the layout shows the solo pick; with
 * none (the sweeper, 30 minutes without a vote, or a Start on another screen) the phone goes to
 * Play with a note, once. A leave this phone made itself says nothing. Returns whether the layout
 * must hold its route change until the pick has been read.
 */
export function useSoloEnd(roomId: string, state: RoomState | undefined, solo: boolean): boolean {
  const { t } = useTranslation('solo');
  const exitToHome = useExitRoomToHome();
  const over = solo && (state === 'done' || state === 'abandoned');
  const matches = useQuery({
    queryKey: [...ROOM_KEY(roomId), 'matches'],
    enabled: over && state === 'done',
    queryFn: () => api.roomMatches({ room_id: roomId }),
    staleTime: 0,
    retry: 1,
  });
  const picked = pickOf(matches.data) !== null;
  const read = state === 'abandoned' || matches.data !== undefined;
  const ended = over && read && !picked;
  const told = useRef(false);
  useEffect(() => {
    if (!ended || told.current) return;
    told.current = true;
    forgetSoloSession(roomId);
    if (isLeavingSolo(roomId)) return;
    showToast({ tone: 'info', title: t('ended.title'), message: t('ended.body') });
    exitToHome();
  }, [ended, roomId, exitToHome, t]);
  // A failed read lets the layout go on to the pick screen, which retries by itself.
  return over && !picked && !matches.isError;
}

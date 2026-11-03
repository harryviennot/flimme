// The removed phone's side (host-menu.md#the-removed-players-side): one message, whichever way it
// learns, shown once. No React in `removedExit`, so a test drives it with plain functions.
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/components/ui/toast';

import { useExitRoomToHome } from './exit-home';
import { keptRoomStore } from './kept-room';
import type { RoomRealtime } from './realtime/controller';

export type RemovedExitDeps = {
  /** The room is kept on the phone right now. */
  isKept: (roomId: string) => boolean;
  forget: (roomId: string) => void;
  goHome: () => void;
  say: () => void;
};

/**
 * Home with the removed message, once per `told` box. `onlyIfKept` is for the path that can't be
 * sure the phone was ever seated (a null room read): without a kept room it only goes Home.
 */
export function removedExit(
  roomId: string,
  told: { current: boolean },
  deps: RemovedExitDeps,
  onlyIfKept: boolean,
): void {
  const mayTell = !onlyIfKept || deps.isKept(roomId);
  deps.forget(roomId);
  // Already told and sent Home by the other path: nothing more to do.
  if (told.current) return;
  deps.goHome();
  if (mayTell) {
    told.current = true;
    deps.say();
  }
}

/** The room layout's way out for a removed seat. */
export function useRemovedExit(roomId: string | undefined): (onlyIfKept: boolean) => void {
  const { t } = useTranslation('join');
  const exit = useExitRoomToHome();
  const told = useRef(false);
  return (onlyIfKept) => {
    if (!roomId) return;
    removedExit(
      roomId,
      told,
      {
        isKept: (id) => keptRoomStore.getState().room?.id === id,
        forget: (id) => keptRoomStore.getState().forget(id),
        goHome: exit,
        say: () => showToast({ tone: 'info', title: t('errors.removed') }),
      },
      onlyIfKept,
    );
  };
}

/** Calls `onRemoved` when `member_removed` names this phone's own seat. */
export function useRemovedListener(
  realtime: RoomRealtime | null,
  mySeatId: string | undefined,
  onRemoved: () => void,
): void {
  const latest = useRef(onRemoved);
  useEffect(() => {
    latest.current = onRemoved;
  });
  useEffect(() => {
    if (!realtime || !mySeatId) return;
    return realtime.listen('member_removed', (payload) => {
      if ((payload as { member_id?: unknown } | null)?.member_id === mySeatId) latest.current();
    });
  }, [realtime, mySeatId]);
}

import { usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { LeaveContext } from '@/features/lobby/leave-context';
import { useLeaveRoom } from '@/features/lobby/use-leave-room';
import { useLeaveSolo } from '@/features/solo/leave';
import { registerRoomGuard, useExitRoomToHome, useMySeat } from '@/features/room';

/**
 * Sits in the room layout, so it guards the room as a whole: the iOS swipe back and Android's
 * back button ask the same question as the Leave button, and only a confirmed Leave takes the
 * phone out (lobby.md#leaving). The sheets are screens inside the room, so closing one is not
 * stopped. While the phone has no seat there is nothing to leave and nothing is prevented.
 */
export function RoomLeaveGuard({
  roomId,
  active = true,
  finished = false,
  solo = false,
  children,
}: {
  roomId: string;
  /** False while a sheet is the room screen in front: closing a sheet is not leaving. */
  active?: boolean;
  /** The room is over (`done`): back and the edge swipe go Home with no alert (winner.md). */
  finished?: boolean;
  /** A solo room: back and the edge swipe leave at once, like the Leave button, with no alert. */
  solo?: boolean;
  children: ReactNode;
}) {
  const seated = useMySeat(roomId) !== null;
  const ask = useLeaveRoom(roomId);
  const exitToHome = useExitRoomToHome();
  const leaveSolo = useLeaveSolo(roomId);
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = finished ? exitToHome : solo ? leaveSolo : ask;
  });
  // Releasing sets the prop and the hook's own state together, so they stay in sync.
  const [released, setReleased] = useState(false);
  const disable = useRef<() => void>(() => {});
  const disablePrevention = usePreventRemove(seated && active && !released, () => askRef.current());
  useEffect(() => {
    disable.current = disablePrevention;
  });
  useEffect(
    () =>
      registerRoomGuard(() => {
        setReleased(true);
        disable.current();
      }),
    [],
  );
  return <LeaveContext value={() => (solo ? leaveSolo() : ask())}>{children}</LeaveContext>;
}

import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { runLeave } from '@/features/lobby/leave';
import { hostSeat, nextHost, seatedSeats } from '@/features/lobby/seats';
import { useOnline } from '@/features/network';
import { useExitRoomToHome, useMySeat, useRoomPresence, useRoomSeats } from '@/features/room';

/**
 * The confirm and the Leave behind it (lobby.md#leaving), shared by the Leave button, the iOS
 * swipe back and Android's back button. Going Home (`useExitRoomToHome`) releases the room's guard.
 */
export function useLeaveRoom(roomId: string | undefined): () => void {
  const { t } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const online = useOnline();
  const seats = useRoomSeats(roomId).data;
  const me = useMySeat(roomId);
  const { away } = useRoomPresence(roomId);
  const exitToHome = useExitRoomToHome();

  const leave = async () => {
    const outcome = await runLeave(roomId ?? '', online);
    if (outcome === 'offline') showToast({ tone: 'warn', title: tc('states.offlineRoom') });
    else if (outcome === 'failed') showToast({ tone: 'warn', title: tc('errors.generic.title') });
    else exitToHome();
  };

  return () => {
    const seated = seatedSeats(seats);
    const host = hostSeat(seated);
    let body: string | undefined;
    if (me?.role !== 'host') body = t('leave.bodyGuest');
    else {
      const next = host ? nextHost(seated, host.member_id, away) : null;
      if (next) body = t('leave.bodyHost', { name: next.display_name });
    }
    Alert.alert(t('leave.title'), body, [
      { text: t('leave.stay'), style: 'cancel' },
      { text: t('leave.confirm'), style: 'destructive', onPress: () => void leave() },
    ]);
  };
}

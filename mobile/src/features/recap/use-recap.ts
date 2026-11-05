import { useTranslation } from 'react-i18next';

import { useAppConfig } from '@/features/app-config/use-app-config';
import { useOnline } from '@/features/network';
import { useRoom, useRoomSeats } from '@/features/room';
import { useWinner } from '@/features/winner/use-winner';

import { deriveRecapView, type RecapView } from './view';

/** Everything the recap sheet shows, from the reads the winner screen already holds. */
export function useRecap(roomId: string): RecapView {
  const { i18n } = useTranslation();
  const room = useRoom(roomId);
  const seats = useRoomSeats(roomId);
  const winner = useWinner(roomId, i18n.language);
  const config = useAppConfig().data;
  const online = useOnline();
  return deriveRecapView({
    room: { data: room.data, isError: room.isError },
    seats: { data: seats.data, isError: seats.isError },
    winner,
    online,
    imageBase: config?.tmdb_image_base,
    inviteBase: config?.invite_base_url,
    retry: () => {
      void room.refetch();
      void seats.refetch();
      if (winner.status === 'error') winner.retry();
    },
  });
}

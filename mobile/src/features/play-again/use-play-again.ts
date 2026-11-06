import { ApiError } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';
import { useOnline } from '@/features/network';
import { keptRoomStore, releaseRoomGuards, SEATS_KEY } from '@/features/room';
import { errorFeedback } from '@/lib/feedback';

import {
  NETWORK_MESSAGE,
  NOT_HOST_MESSAGE,
  OFFLINE_MESSAGE,
  PLAY_AGAIN_ROWS,
  type PlayAgainMessage,
} from './rows';

/**
 * The host's Play again (winner.md#play-again): one call, no confirmation. The old seat is not
 * left (the room is over, and a leave would hand its host role to a guest). Answers walk
 * PLAY_AGAIN_ROWS; the button stays `loading` after `ok` until the screen is left.
 */
export function usePlayAgain(roomId: string) {
  const { t } = useTranslation('playAgain');
  const online = useOnline();
  const client = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const busy = useRef(false);

  const warn = useCallback(
    (message: PlayAgainMessage, buzz: boolean) => {
      showToast({ tone: 'warn', title: t(message) });
      if (buzz) errorFeedback();
    },
    [t],
  );

  const press = useCallback(async () => {
    if (busy.current) return;
    if (!online) {
      warn(OFFLINE_MESSAGE, false);
      return;
    }
    busy.current = true;
    setLoading(true);
    let stay = true;
    try {
      const result = await api.playAgain({ room_id: roomId });
      const row = PLAY_AGAIN_ROWS[result.status];
      if (row.kind === 'go' && result.status === 'ok') {
        stay = false;
        keptRoomStore.getState().keep({ id: result.room_id, code: result.code });
        releaseRoomGuards();
        router.replace(`/room/${result.room_id}/lobby` as never);
      } else if (row.kind === 'name') {
        router.push('/name?edit=1');
      } else if (row.kind === 'toast') {
        if (row.hide) setHidden(true);
        warn(row.message, true);
      }
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'denied') {
        // No longer the host: the seats say whether the button stays.
        void client.invalidateQueries({ queryKey: SEATS_KEY(roomId) });
        warn(NOT_HOST_MESSAGE, true);
      } else {
        warn(NETWORK_MESSAGE, true);
      }
    } finally {
      if (stay) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [online, roomId, client, warn]);

  return { loading, hidden, press };
}

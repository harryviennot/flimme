import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { api } from '@/api';

import { ROOM_KEY } from './queries';

export const HEARTBEAT_MS = 30_000;

/**
 * While the app is in the foreground, marks the seat present at once and every 30 seconds
 * (app-structure.md#realtime). Timers can't be relied on in the background on iOS, so it stops
 * there and starts again, with an immediate call, when the app comes back. A failed call is
 * not shown: the next one tries again.
 */
export function useHeartbeat(roomId: string | undefined, enabled = true): void {
  useEffect(() => {
    if (!roomId || !enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const beat = () => {
      api.touchRoom({ room_id: roomId }).catch(() => {});
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') start();
      else stop();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [roomId, enabled]);
}

/**
 * Coming back to the foreground re-reads the room and everything under it (reconnecting.md#states:
 * "Nothing, unless something changed"). The screens follow what the database says.
 */
export function useRefreshOnForeground(roomId: string | undefined): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!roomId) return;
    let last = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') {
        void client.invalidateQueries({ queryKey: ROOM_KEY(roomId) });
      }
      last = next;
    });
    return () => subscription.remove();
  }, [client, roomId]);
}

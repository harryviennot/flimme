import type { RoomState } from '@flimme/contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

import { api } from '@/api';
import { hideToast } from '@/components/ui/toast';
import { ROOM_KEY, type RoomRealtime } from '@/features/room';
import { matchShownStore } from '@/features/room/match-shown';
import { voteQueue } from '@/features/swipe';
import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

import { createMatchController, type MatchController, type PlayingMatch } from './controller';

const NONE = () => null;
const NEVER = () => () => {};

function readEvent(payload: unknown) {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p.title_id !== 'number') return null;
  return {
    title_id: p.title_id,
    likes: typeof p.likes === 'number' ? p.likes : undefined,
    of: typeof p.of === 'number' ? p.of : undefined,
    decided: typeof p.decided === 'boolean' ? p.decided : undefined,
  };
}

/**
 * The match overlay for one room. `enabled` is false for a phone whose seat has left: it never
 * shows. `holdRoute` is true while the layout must keep the room screen where it is: the
 * overlay is playing, or the room is `done` and its pick is still being read.
 */
export function useMatchOverlay(
  roomId: string | undefined,
  roomState: RoomState | undefined,
  enabled: boolean,
  realtime: Pick<RoomRealtime, 'listen'> | null,
): { match: PlayingMatch | null; skip: () => void; finish: () => void; holdRoute: boolean } {
  const [controller, setController] = useState<MatchController | null>(null);
  const screenReader = useRef(false);
  const shown = matchShownStore((s) => (roomId ? s.rooms.includes(roomId) : false));

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      screenReader.current = on;
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
      screenReader.current = on;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!roomId || !enabled) return;
    const created = createMatchController(roomId, {
      isShown: (id) => matchShownStore.getState().has(id),
      markShown: (id) => matchShownStore.getState().mark(id),
      onStart: () => {
        // The near-miss toast leaves as the scrim comes in.
        hideToast();
        haptics.match();
        void playSound('match').catch(() => undefined);
      },
      screenReaderOn: () => screenReader.current,
    });
    setController(created);
    const off = voteQueue.onAnswer((event) => {
      if (event.type === 'match' && event.room_id === roomId) {
        created.signal({ title_id: event.title_id, decided: event.decided });
      }
    });
    return () => {
      off();
      created.stop();
      setController(null);
    };
  }, [roomId, enabled]);

  useEffect(() => {
    if (!controller || !realtime) return;
    return realtime.listen('match', (payload) => {
      const event = readEvent(payload);
      if (event) controller.signal(event);
    });
  }, [controller, realtime]);

  // A phone that missed the event (offline, background) finds the pick when it reads again.
  const reading = !!roomId && enabled && roomState === 'done' && !shown;
  const matches = useQuery({
    queryKey: [...ROOM_KEY(roomId ?? ''), 'matches'],
    enabled: reading,
    queryFn: () => api.roomMatches({ room_id: roomId ?? '' }),
    staleTime: 0,
    retry: 1,
  });
  useEffect(() => {
    if (reading && controller && matches.data && roomState) {
      controller.reread(roomState, matches.data);
    }
  }, [reading, controller, matches.data, roomState]);

  const match = useSyncExternalStore(
    controller ? controller.subscribe : NEVER,
    controller ? controller.get : NONE,
    NONE,
  );

  return {
    match,
    skip: () => controller?.skip(),
    finish: () => controller?.finish(),
    // Also while the pick is read but the overlay has not started: no frame shows the winner first.
    holdRoute:
      match !== null ||
      (reading &&
        (matches.data ? matches.data.some((row) => row.pick_order === 1) : matches.isFetching)),
  };
}

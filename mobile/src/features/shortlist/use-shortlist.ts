import type { RoomMatch } from '@flimme/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/api';
import { ROOM_KEY, type RoomRealtime } from '@/features/room';
import { voteQueue } from '@/features/swipe';
import { haptics } from '@/lib/haptics';

import { createShortlistController, type BeatSignal, type ShortlistController } from './controller';

const SHORTLIST_KEY = (roomId: string) => [...ROOM_KEY(roomId), 'shortlist'] as const;

function readEvent(payload: unknown): BeatSignal | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p.title_id !== 'number') return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    title_id: p.title_id,
    likes: num(p.likes),
    of: num(p.of),
    decided: typeof p.decided === 'boolean' ? p.decided : undefined,
    shortlisted: num(p.shortlisted),
    shortlist_size: num(p.shortlist_size),
  };
}

/** The films on the shortlist while swiping: every row without a pick order, oldest first. */
export function shortlistOf(rows: readonly RoomMatch[]): number[] {
  return rows
    .filter((row) => row.pick_order === null && row.kind !== 'finale')
    .map((row) => row.title_id);
}

/**
 * The room's shortlist for the layout: the beat from the phone's own answer and from the `match`
 * event, and the read-back (cold start, reconnect, foreground) that fills the top bar with no
 * beat. `enabled` is false for a phone whose seat has left.
 */
export function useShortlist(
  roomId: string | undefined,
  state: string | undefined,
  mode: string | undefined,
  enabled: boolean,
  realtime: Pick<RoomRealtime, 'listen'> | null,
): ShortlistController | null {
  const queryClient = useQueryClient();
  const [controller, setController] = useState<ShortlistController | null>(null);

  useEffect(() => {
    if (!roomId || !enabled) return;
    const created = createShortlistController({
      onBeat: () => haptics.shortlist(),
      onMismatch: () => void queryClient.invalidateQueries({ queryKey: SHORTLIST_KEY(roomId) }),
    });
    // The controller is an external object made per room; the layout reads it through state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setController(created);
    const off = voteQueue.onAnswer((event) => {
      if (event.type !== 'match' || event.room_id !== roomId) return;
      if (event.decided === true) created.pickArrived();
      else created.signal({ title_id: event.title_id, decided: event.decided });
    });
    return () => {
      off();
      created.stop();
      setController(null);
    };
  }, [roomId, enabled, queryClient]);

  useEffect(() => {
    if (!controller || !realtime) return;
    return realtime.listen('match', (payload) => {
      const event = readEvent(payload);
      if (!event) return;
      if (event.decided === true) controller.pickArrived();
      else controller.signal(event);
    });
  }, [controller, realtime]);

  const reading = !!roomId && enabled && state === 'swiping';
  const matches = useQuery({
    queryKey: SHORTLIST_KEY(roomId ?? ''),
    enabled: reading,
    queryFn: () => api.roomMatches({ room_id: roomId ?? '' }),
    staleTime: 0,
    retry: 1,
  });
  useEffect(() => {
    if (controller && matches.data) controller.readBack(shortlistOf(matches.data));
  }, [controller, matches.data]);

  const modes = useQuery({
    queryKey: ['game_modes'],
    enabled: !!roomId && enabled,
    queryFn: () => api.gameModes(),
    staleTime: Infinity,
    retry: 1,
  });
  const size = modes.data?.find((m) => m.slug === mode)?.matches_to_end;
  useEffect(() => {
    if (controller && size) controller.setSize(size);
  }, [controller, size]);

  return controller;
}

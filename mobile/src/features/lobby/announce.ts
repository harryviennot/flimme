// Arrivals and departures are announced to screen readers politely, at most one a second
// (lobby.md#accessibility): later ones wait their turn.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { RoomSeat } from '@flimme/contract';

import { seatChanges } from './seats';

export const ANNOUNCE_GAP_MS = 1_000;

export function createAnnouncer(say: (message: string) => void, gap = ANNOUNCE_GAP_MS) {
  const queue: string[] = [];
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const message = queue.shift();
    if (message === undefined) return;
    last = Date.now();
    say(message);
    if (queue.length > 0) timer = setTimeout(flush, gap);
  };

  return {
    announce(message: string) {
      queue.push(message);
      if (timer) return;
      const wait = last + gap - Date.now();
      if (wait <= 0) flush();
      else timer = setTimeout(flush, wait);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      queue.length = 0;
    },
  };
}

/**
 * Says `joined(name)` / `left(name)` for each seat that arrived or left between two reads. The
 * first read is the room as it was, not news; the phone's own seat is never announced.
 */
export function useSeatAnnouncements(
  seated: readonly RoomSeat[] | undefined,
  say: { joined: (name: string) => string; left: (name: string) => string },
) {
  const previous = useRef<readonly RoomSeat[] | null>(null);
  const announcer = useRef<ReturnType<typeof createAnnouncer> | null>(null);
  const words = useRef(say);
  useEffect(() => {
    words.current = say;
  });

  useEffect(() => {
    announcer.current = createAnnouncer((message) =>
      AccessibilityInfo.announceForAccessibility(message),
    );
    return () => announcer.current?.stop();
  }, []);

  useEffect(() => {
    if (!seated) return;
    const before = previous.current;
    previous.current = seated;
    if (!before) return;
    const others = (list: readonly RoomSeat[]) => list.filter((seat) => !seat.is_me);
    const changes = seatChanges(others(before), others(seated));
    for (const name of changes.joined) announcer.current?.announce(words.current.joined(name));
    for (const name of changes.left) announcer.current?.announce(words.current.left(name));
  }, [seated]);
}

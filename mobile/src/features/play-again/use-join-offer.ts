import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/api';
import { useOnline } from '@/features/network';
import { roomRouteFor } from '@/features/join/link';
import { keptRoomId, leaveOldSeat } from '@/features/join/old-seat';
import {
  NETWORK_ROW,
  OFFLINE_ROW,
  STARTING_GAVE_UP,
  STARTING_RETRIES,
  STARTING_RETRY_MS,
  type JoinMessage,
} from '@/features/join/rows';
import { keptRoomStore, releaseRoomGuards } from '@/features/room';
import { haptics } from '@/lib/haptics';

import { OFFER_ROWS } from './join-rows';
import type { NextRoom } from './offer';

/** What the card shows under the title: the usual line, the wait, or a refusal. */
export type OfferView = {
  /** The line replacing "Same settings as this one", if any. */
  message: JoinMessage | null;
  params?: { max: number };
  /** `join:shuffling` instead of a refusal. */
  shuffling: boolean;
  button: 'join' | 'loading' | 'retry' | 'hidden';
};

const IDLE: OfferView = { message: null, shuffling: false, button: 'join' };

/**
 * The Join offer's tap (winner.md#the-join-offer): `joinRoom({code, ref, via: 'play_again'})`, the
 * retries while the game starts, the wait while offline, the trip to the join sheet for a name.
 * Never logs the code or the reference.
 */
export function useJoinOffer(next: NextRoom | null) {
  const online = useOnline();
  const [state, setState] = useState<{ code: string | undefined; view: OfferView }>({
    code: next?.code,
    view: IDLE,
  });
  const code = next?.code;
  const codeRef = useRef(code);
  // A view belongs to the code it was made for: a new code starts the card over.
  const view = state.code === code ? state.view : IDLE;
  const setView = useCallback(
    (next: OfferView) => setState({ code: codeRef.current, view: next }),
    [],
  );
  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitingOnline = useRef(false);
  const onlineRef = useRef(online);
  const nextRef = useRef(next);
  useEffect(() => {
    onlineRef.current = online;
    nextRef.current = next;
    codeRef.current = code;
  });

  const cancel = useCallback(() => {
    runId.current += 1;
    clearTimeout(timer.current);
    waitingOnline.current = false;
  }, []);

  const attempt = useCallback(async () => {
    const target = nextRef.current;
    if (!target) return;
    cancel();
    const id = runId.current;
    // The kept room now: the new room's layout overwrites it once mounted.
    const oldRoomId = keptRoomId();
    if (!onlineRef.current) {
      waitingOnline.current = true;
      setView({ message: OFFLINE_ROW.message, shuffling: false, button: 'loading' });
      return;
    }
    setView({ message: null, shuffling: false, button: 'loading' });

    for (let tries = 0; ; tries += 1) {
      let result;
      try {
        result = await api.joinRoom({ code: target.code, ref: target.roomId, via: 'play_again' });
      } catch {
        if (id !== runId.current) return;
        haptics.error();
        setView({ message: NETWORK_ROW.message, shuffling: false, button: 'retry' });
        return;
      }
      if (id !== runId.current) return;
      const row = OFFER_ROWS[result.status as keyof typeof OFFER_ROWS];
      if (!row) {
        haptics.error();
        setView({ message: NETWORK_ROW.message, shuffling: false, button: 'retry' });
        return;
      }
      if (row.kind === 'go' && result.status === 'ok') {
        leaveOldSeat(result.room_id, oldRoomId);
        keptRoomStore.getState().keep({ id: result.room_id, code: target.code });
        releaseRoomGuards();
        router.replace(roomRouteFor(result.room_id, result.state) as never);
        return;
      }
      if (row.kind === 'name') {
        setView(IDLE);
        router.push({ pathname: '/join/[code]', params: { code: target.code, r: target.roomId } });
        return;
      }
      if (row.kind === 'wait') {
        if (tries >= STARTING_RETRIES) {
          haptics.error();
          setView({ message: STARTING_GAVE_UP.message, shuffling: false, button: 'retry' });
          return;
        }
        setView({ message: null, shuffling: true, button: 'loading' });
        await new Promise<void>((resolve) => {
          timer.current = setTimeout(resolve, STARTING_RETRY_MS);
        });
        if (id !== runId.current) return;
        continue;
      }
      if (row.kind === 'line') {
        haptics.error();
        setView({
          message: row.message,
          params: result.status === 'full' ? { max: result.max_players } : undefined,
          shuffling: false,
          button: row.button,
        });
      }
      return;
    }
  }, [cancel, setView]);

  // Offline at the tap: join by itself when the connection comes back.
  useEffect(() => {
    if (online && waitingOnline.current) void attempt();
  }, [online, attempt]);

  // A new code (a second `next_room`) starts the card over; unmounting stops any retry.
  useEffect(() => cancel, [code, cancel]);

  return { view, join: () => void attempt() };
}

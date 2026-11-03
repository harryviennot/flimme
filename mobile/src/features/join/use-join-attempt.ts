import { useQueryClient } from '@tanstack/react-query';
import type { MyProfile } from '@flimme/contract';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/api';
import { useOnline } from '@/features/network';
import { MY_PROFILE_KEY } from '@/features/profile';
import { haptics } from '@/lib/haptics';

import { CODE_LENGTH, digitsOf, readPasted, roomRouteFor } from './link';
import { keptRoomId, leaveOldSeat } from './old-seat';
import {
  JOIN_ROWS,
  NETWORK_ROW,
  OFFLINE_ROW,
  STARTING_GAVE_UP,
  STARTING_RETRIES,
  STARTING_RETRY_MS,
  type JoinMessage,
} from './rows';

/** What the status line and the buttons under the boxes show. */
export type JoinView =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'shuffling' }
  | {
      kind: 'message';
      message: JoinMessage;
      params?: { max: number };
      next: 'host' | 'retry' | null;
    };

const IDLE: JoinView = { kind: 'idle' };

/**
 * The join screen's logic: the digits, the call (as soon as the sixth digit is in), the retries
 * while the game is starting, the wait while offline, the trip to the name screen and back.
 * Never logs the code or the reference.
 */
export function useJoinAttempt() {
  const online = useOnline();
  const client = useQueryClient();

  const [code, setCodeState] = useState('');
  const [view, setView] = useState<JoinView>(IDLE);
  const [shaking, setShaking] = useState(false);

  const codeRef = useRef('');
  const refRef = useRef<string | undefined>(undefined);
  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waitingOnline = useRef(false);
  const waitingName = useRef(false);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  });

  const updateCode = useCallback((next: string) => {
    codeRef.current = next;
    setCodeState(next);
  }, []);

  const cancel = useCallback(() => {
    runId.current += 1;
    clearTimeout(timer.current);
    waitingOnline.current = false;
  }, []);

  const attempt = useCallback(
    async (digits: string) => {
      cancel();
      const id = runId.current;
      // The kept room now, before the call: the new room's layout overwrites it once mounted.
      const oldRoomId = keptRoomId();
      if (!onlineRef.current) {
        waitingOnline.current = true;
        setView({ kind: 'message', ...OFFLINE_ROW });
        return;
      }
      setView({ kind: 'checking' });

      const ref = refRef.current;
      for (let tries = 0; ; tries += 1) {
        let result;
        try {
          result = await api.joinRoom(
            ref ? { code: digits, ref, via: 'link' } : { code: digits, via: 'code' },
          );
        } catch {
          if (id !== runId.current) return;
          haptics.error();
          setView({ kind: 'message', ...NETWORK_ROW });
          return;
        }
        if (id !== runId.current) return;

        const row = JOIN_ROWS[result.status as keyof typeof JOIN_ROWS];
        if (!row) {
          // An answer this build doesn't know: treat it like a failed call.
          haptics.error();
          setView({ kind: 'message', ...NETWORK_ROW });
          return;
        }
        if (row.kind === 'go') {
          if (result.status === 'ok') {
            leaveOldSeat(result.room_id, oldRoomId);
            router.replace(roomRouteFor(result.room_id, result.state) as never);
          } else {
            waitingName.current = true;
            setView(IDLE);
            router.push({ pathname: '/name', params: { code: digits } });
          }
          return;
        }
        if (row.kind === 'wait') {
          if (tries >= STARTING_RETRIES) {
            haptics.error();
            setView({ kind: 'message', ...STARTING_GAVE_UP });
            return;
          }
          setView({ kind: 'shuffling' });
          await new Promise<void>((resolve) => {
            timer.current = setTimeout(resolve, STARTING_RETRY_MS);
          });
          if (id !== runId.current) return;
          continue;
        }

        haptics.error();
        setView({
          kind: 'message',
          message: row.message,
          params: result.status === 'full' ? { max: result.max_players } : undefined,
          next: row.next,
        });
        if (row.boxes === 'shake') setShaking(true);
        else if (row.boxes === 'clear') updateCode('');
        return;
      }
    },
    [cancel, updateCode],
  );

  /** A keystroke or a delete: any change clears the message and the red boxes. */
  const setCode = useCallback(
    (text: string) => {
      const next = digitsOf(text);
      if (next === codeRef.current) return;
      cancel();
      waitingName.current = false;
      refRef.current = undefined;
      setShaking(false);
      setView(IDLE);
      updateCode(next);
      if (next.length === CODE_LENGTH) void attempt(next);
    },
    [attempt, cancel, updateCode],
  );

  /** Pasted text: an invite link gives its code and room reference, else the digits. */
  const paste = useCallback(
    (text: string) => {
      const { code: next, ref } = readPasted(text);
      cancel();
      waitingName.current = false;
      refRef.current = ref;
      setShaking(false);
      setView(IDLE);
      updateCode(next);
      if (next.length === CODE_LENGTH) void attempt(next);
    },
    [attempt, cancel, updateCode],
  );

  /** The shake is over: empty the boxes and start again from the first one. */
  const finishShake = useCallback(() => {
    setShaking(false);
    updateCode('');
  }, [updateCode]);

  const retry = useCallback(() => {
    if (codeRef.current.length === CODE_LENGTH) void attempt(codeRef.current);
  }, [attempt]);

  // Offline at the sixth digit: join by itself when the connection comes back.
  useEffect(() => {
    if (online && waitingOnline.current && codeRef.current.length === CODE_LENGTH) {
      void attempt(codeRef.current);
    }
  }, [online, attempt]);

  // Back from the name screen: join again only if the profile now has a name.
  useFocusEffect(
    useCallback(() => {
      if (!waitingName.current) return;
      waitingName.current = false;
      // Read the cache now: this screen may have been frozen while the name screen was open.
      const profile = client.getQueryData<MyProfile | null>(MY_PROFILE_KEY);
      if (profile?.display_name && codeRef.current.length === CODE_LENGTH) {
        void attempt(codeRef.current);
      }
    }, [attempt, client]),
  );

  useEffect(() => cancel, [cancel]);

  return {
    code,
    view,
    shaking,
    error: view.kind === 'message' && view.message !== 'errors.offline',
    setCode,
    paste,
    finishShake,
    retry,
  };
}

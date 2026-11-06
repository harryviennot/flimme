import type { RoomRound, RoomState } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { isSheet, type RoomRealtime } from '@/features/room';
import { matchShownStore, useMatchShown } from '@/features/room/match-shown';

import { REVEAL_READ_LIMIT_MS, readRevealEvent, revealFromViews } from './reveal';
import { revealStore, useRevealOf } from './reveal-store';
import { candidatesQuery, finalistCardsQuery, roundsQuery } from './queries';

/** The latest round that closed with a winner. */
export function closedRound(rounds: readonly RoomRound[] | undefined): RoomRound | null {
  const closed = (rounds ?? []).filter((r) => r.stage === 'closed' && r.winner_title_id !== null);
  return closed.length === 0 ? null : closed.reduce((a, b) => (b.seq > a.seq ? b : a));
}

/** Whether the phone is on a screen the `done` state is about to replace. */
function replaceable(current: string | undefined): boolean {
  return (
    current === 'swipe' ||
    current === 'final-cut' ||
    (!!current && isSheet(current) && current !== 'recap')
  );
}

/**
 * Whether the room layout keeps the room screen where it is after the round closes, so the
 * reveal can play before the winner screen (final-cut.md#the-reveal). True while the reveal
 * plays, and while a `done` room's reveal is being looked for (the event, or the reads of a
 * missed one, at most 3 seconds). It starts the reveal from the finale's `match` event, once.
 */
export function useRevealHold(
  roomId: string | undefined,
  state: RoomState | undefined,
  current: string | undefined,
  realtime: Pick<RoomRealtime, 'listen'> | null,
): boolean {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const shown = useMatchShown(roomId);
  const reveal = useRevealOf(roomId);
  const looking = reveal.phase === 'idle' || reveal.phase === 'waiting';
  const checking = !!roomId && state === 'done' && !shown && looking && replaceable(current);

  useEffect(() => {
    if (!roomId || !realtime) return;
    return realtime.listen('match', (payload) => {
      const data = readRevealEvent(payload);
      if (!data || matchShownStore.getState().has(roomId)) return;
      // A second event, or one after a re-read started the reveal, plays nothing more.
      revealStore.getState().play(roomId, data, true);
    });
  }, [roomId, realtime]);

  // A phone that missed the event reads the closed round once and plays it.
  useEffect(() => {
    if (!checking || !roomId) return;
    let cancelled = false;
    revealStore.getState().wait(roomId);
    const read = async () => {
      const rounds = await queryClient.fetchQuery(roundsQuery(roomId));
      const round = closedRound(rounds);
      if (!round) return null;
      const candidates = await queryClient.fetchQuery(candidatesQuery(roomId, round.id));
      const data = revealFromViews(round, candidates);
      if (data) {
        void queryClient
          .prefetchQuery(
            finalistCardsQuery(
              roomId,
              data.finalists.map((x) => x.titleId),
              i18n.language,
            ),
          )
          .catch(() => undefined);
      }
      return data;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<'late'>((resolve) => {
      timer = setTimeout(() => resolve('late'), REVEAL_READ_LIMIT_MS);
    });
    Promise.race([read(), limit])
      .then((result) => {
        clearTimeout(timer);
        if (cancelled) return;
        const store = revealStore.getState();
        // The event may have started it while the reads were out.
        if (store.roomId === roomId && store.phase === 'playing') return;
        if (result && result !== 'late') {
          store.play(roomId, result);
        } else {
          // Nothing to reveal, or the film matters more than the show: the winner screen.
          if (result === null) {
            /* no closed round: not a Final Cut room, nothing to mark */
          } else matchShownStore.getState().mark(roomId);
          store.finish(roomId);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        if (!cancelled) revealStore.getState().finish(roomId);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checking, roomId, queryClient, i18n.language]);

  return reveal.phase === 'playing' || checking;
}

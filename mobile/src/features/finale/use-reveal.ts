import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, useWindowDimensions } from 'react-native';

import type { PosterSource } from '@/components/shared/poster';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { matchShownStore } from '@/features/room/match-shown';
import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

import { finalistCardsQuery } from './queries';
import {
  knockedOut,
  lineKey,
  pointsShow,
  reached,
  revealPlan,
  revealSoundStart,
  type LineKey,
  type RevealStage,
} from './reveal';
import { revealStore, useRevealOf } from './reveal-store';
import { finalistViews, type FinalistView } from './rounds';

// What the Final Cut screen shows while the reveal plays, and the clock that plays it.

/** One finalist's look at this step. */
export type FinalistReveal = {
  stage: RevealStage;
  /** Knocked out (from the knock-out step). */
  out: boolean;
  winner: boolean;
  /** The total the band counts up to, or null while there is no band. */
  points: number | null;
};

export type RevealView =
  | { kind: 'waiting' }
  | {
      kind: 'playing';
      stage: RevealStage;
      finalists: { view: FinalistView; reveal: FinalistReveal }[];
      winner: FinalistView | null;
      winnerPoints: number | null;
      line: LineKey | null;
      /** The knocked-out films' titles, in seed order. */
      vetoedTitles: string[];
      /** A screen reader is on: no automatic hand-over. */
      screenReader: boolean;
      /** A tap, Where to watch or Android's back goes on (from the winner step). */
      goOn: () => void;
    };

/** The reveal for this room, or null when none is on. */
export function useRevealView(
  roomId: string,
  language: string,
  /** Posters to use instead of the cards' (the dev menu's fixtures). */
  posters?: Readonly<Record<number, PosterSource>>,
): RevealView | null {
  const reveal = useRevealOf(roomId);
  const data = reveal.phase === 'playing' ? reveal.data : null;
  // The stage belongs to one run of the clock: a restart reads as `clear` until it moves.
  const [clock, setClock] = useState<{ key: string; stage: RevealStage }>({
    key: '',
    stage: 'clear',
  });
  const stageRef = useRef<RevealStage>('clear');
  const screenReader = useRef(false);
  const [reader, setReader] = useState(false);
  const { width } = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;

  const ids = data ? data.finalists.map((x) => x.titleId) : [];
  const cards = useQuery({
    ...finalistCardsQuery(roomId, ids, language),
    enabled: ids.length > 0,
  });

  const { run } = reveal;
  const runKey = `${roomId}:${run}`;
  const stage: RevealStage = clock.key === runKey ? clock.stage : 'clear';

  function move(next: RevealStage) {
    stageRef.current = next;
    setClock({ key: runKey, stage: next });
  }

  function finish() {
    matchShownStore.getState().mark(roomId);
    revealStore.getState().finish(roomId);
  }

  // The clock: every time comes from the plan, counted from when the data is here.
  useEffect(() => {
    if (!data) return;
    const plan = revealPlan(data);
    stageRef.current = 'clear';
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Started so its ta-dum lands on the winner's lift (sounds.md#the-reveal).
    const soundAt = revealSoundStart(plan);
    // Only a reveal this phone saw start live has a sound; a missed or replayed one is silent.
    if (reveal.live) {
      if (soundAt === 0) void playSound('reveal');
      else timers.push(setTimeout(() => void playSound('reveal'), soundAt));
    }
    if (plan.knockouts !== null) {
      timers.push(
        setTimeout(() => {
          move('knockouts');
          haptics.veto();
        }, plan.knockouts),
      );
    }
    if (plan.points !== null) timers.push(setTimeout(() => move('points'), plan.points));
    timers.push(
      setTimeout(() => {
        move('winner');
        haptics.match();
        matchShownStore.getState().mark(roomId);
      }, plan.winner),
    );
    // With a screen reader on, the button goes on: the announcement is never cut off.
    timers.push(
      setTimeout(() => {
        if (!screenReader.current) finish();
      }, plan.handOver),
    );
    return () => timers.forEach(clearTimeout);
    // `data` is stable for a run; `run` restarts the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, run, roomId]);

  // Sent to the background: before the winner step the reveal plays again on return; after it,
  // the phone goes straight to the winner screen.
  useEffect(() => {
    if (!data) return;
    let away = false;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') away = true;
      else if (next === 'active' && away) {
        away = false;
        if (stageRef.current === 'winner') finish();
        else revealStore.getState().restart(roomId);
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, roomId]);

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      screenReader.current = on;
      setReader(on);
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
      screenReader.current = on;
      setReader(on);
    });
    return () => subscription.remove();
  }, []);

  // Leaving the screen mid-reveal counts as shown.
  useEffect(
    () => () => {
      const s = revealStore.getState();
      if (s.roomId === roomId && s.phase === 'playing') {
        matchShownStore.getState().mark(roomId);
        s.finish(roomId);
      }
    },
    [roomId],
  );

  if (reveal.phase === 'waiting') return { kind: 'waiting' };
  if (!data) return null;

  const views = finalistViews(ids, cards.data, imageBase, width).map((view) =>
    posters?.[view.titleId] ? { ...view, poster: posters[view.titleId] ?? null } : view,
  );
  const showPoints = pointsShow(data);
  const out = new Set(data.finalists.filter((x) => x.vetoed).map((x) => x.titleId));
  const finalists = views.map((view) => {
    const row = data.finalists.find((x) => x.titleId === view.titleId);
    const isOut = out.has(view.titleId) && reached(stage, 'knockouts');
    return {
      view,
      reveal: {
        stage,
        out: isOut,
        winner: view.titleId === data.winnerId && stage === 'winner',
        points:
          showPoints && !out.has(view.titleId) && reached(stage, 'points')
            ? (row?.points ?? 0)
            : null,
      },
    };
  });
  const titleOf = new Map(views.map((v) => [v.titleId, v.title]));
  const winner = views.find((v) => v.titleId === data.winnerId) ?? null;
  const winnerRow = data.finalists.find((x) => x.titleId === data.winnerId);

  return {
    kind: 'playing',
    stage,
    finalists,
    winner,
    winnerPoints: showPoints ? (winnerRow?.points ?? null) : null,
    line: lineKey(data),
    vetoedTitles: knockedOut(data).flatMap((id) => titleOf.get(id) ?? []),
    screenReader: reader,
    goOn: () => {
      if (stageRef.current === 'winner') finish();
    },
  };
}

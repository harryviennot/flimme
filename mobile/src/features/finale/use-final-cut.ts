import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

import { api } from '@/api';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useOnline } from '@/features/network';
import {
  mySeatOf,
  ROOM_KEY,
  SEATS_KEY,
  useExitRoomToHome,
  useRoomEvent,
  useRoomSeats,
} from '@/features/room';
import { haptics } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';

import {
  ballotToSend,
  EMPTY_BALLOT,
  placesOf,
  pressFinalist,
  tapFinalist,
  vetoAllowed,
  type Ballot,
  type Place,
} from './ballot';
import { createCloser } from './closing';
import { closeDelay, shownDeadline, SLOW_COUNT_MS } from './countdown';
import { createLockIn, type LockIn, type LockInState } from './lock-in';
import { phaseOf, statusKey, takesTaps, ticks, type Phase } from './phase';
import {
  everyoneLocked,
  lockedCount,
  lockedInRow,
  mergeLocked,
  readProgressEvent,
  rowSeats,
} from './progress';
import { candidatesQuery, finalistCardsQuery, progressQuery, roundsQuery } from './queries';
import { finalistViews, openRound, type FinalistView } from './rounds';

// Everything the Final Cut screen shows and does (final-cut.md), in one place and without JSX.

export type LockInSeat = { memberId: string; name: string; avatarKey: string; locked: boolean };

export type FinalCutModel = {
  kind: 'final_cut' | 'ranked_vote';
  phase: Phase;
  /** The round or its finalists can't be read. */
  loadFailed: boolean;
  /** The cards can't be read (the ballot still works). */
  postersFailed: boolean;
  /** How many posters to hold a place for while loading. */
  slots: number;
  finalists: FinalistView[];
  places: ReadonlyMap<number, Place>;
  vetoAllowed: boolean;
  /** The shown deadline, once the round is read. */
  deadline: string | null;
  /** Whether the countdown shows (it leaves at zero and when everyone locked in). */
  countdownOn: boolean;
  tick: boolean;
  seats: LockInSeat[];
  count: number;
  of: number;
  status: ReturnType<typeof statusKey>;
  /** A restart where the server says this seat locked in. */
  meLocked: boolean;
  /** A restart where the server says this seat locked in: the phone no longer has its ballot, so no numbers. */
  numbersHidden: boolean;
  online: boolean;
  onTap: (titleId: number) => void;
  onLongPress: (titleId: number) => void;
  /** After a screen reader action, the new state to announce. */
  onLockIn: () => void;
  onEnd: () => void;
  retryLoad: () => void;
  retryPosters: () => void;
};

export function useFinalCut(roomId: string, language: string): FinalCutModel {
  const queryClient = useQueryClient();
  const online = useOnline();
  const { width } = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const exitToHome = useExitRoomToHome();

  const rounds = useQuery(roundsQuery(roomId));
  const round = openRound(rounds.data);
  const roundId = round?.id ?? '';
  const candidates = useQuery({
    ...candidatesQuery(roomId, roundId),
    enabled: !!round,
  });
  const seedOrder = (candidates.data ?? []).map((c) => c.title_id);
  const cards = useQuery({
    ...finalistCardsQuery(roomId, seedOrder, language),
    enabled: seedOrder.length > 0,
  });
  const progress = useQuery({ ...progressQuery(roomId, roundId), enabled: !!round });
  const seatsData = useRoomSeats(roomId).data;
  const mine = mySeatOf(seatsData);

  // The deadline shown: never more than 60 seconds after this phone first read the round.
  // `dataUpdatedAt` is when the answer reached this phone.
  const [firstRead, setFirstRead] = useState<{ id: string; at: number } | null>(null);
  if (round && firstRead?.id !== round.id) setFirstRead({ id: round.id, at: rounds.dataUpdatedAt });
  const deadline =
    round && firstRead?.id === round.id ? shownDeadline(round.stage_closes_at, firstRead.at) : null;

  // The ballot lives in memory: a trip to the background keeps it, a cold start does not.
  const [ballot, setBallot] = useState<Ballot>(EMPTY_BALLOT);
  const [liftVetoHint, setLiftVetoHint] = useState(false);
  const kind = round?.kind ?? 'final_cut';
  const canVeto = vetoAllowed(kind, mine?.vetoes_left);

  // Locking in.
  const [held, setHeld] = useState<{ id: string; lockIn: LockIn } | null>(null);
  if (roundId && held?.id !== roundId) {
    setHeld({
      id: roundId,
      lockIn: createLockIn({
        send: (sent) =>
          api.castBallot({ round_id: roundId, ranking: sent.ranking, veto: sent.veto }),
        report: (status) => reportError(new Error(`cast_ballot: ${status}`)),
        onNoVeto: () => void queryClient.invalidateQueries({ queryKey: SEATS_KEY(roomId) }),
      }),
    });
  }
  const lockIn = held?.id === roundId ? held.lockIn : null;
  useEffect(() => () => lockIn?.stop(), [lockIn]);
  const lockState = useSyncExternalStore<LockInState>(
    lockIn ? lockIn.subscribe : NEVER,
    lockIn ? lockIn.get : IDLE_STATE,
    IDLE_STATE,
  );

  // A seat that is no longer in the room goes Home, as one that left.
  useEffect(() => {
    if (lockState.kind === 'left') exitToHome();
  }, [lockState.kind, exitToHome]);

  // Who has locked in: the read, the events, and this phone's own answer. They only grow.
  const [heard, setHeard] = useState<{ round: string; locked: string[]; of: number | null }>({
    round: '',
    locked: [],
    of: null,
  });
  useRoomEvent(roomId, 'round_progress', (payload) => {
    const event = readProgressEvent(payload);
    if (!event || event.round_id !== roundId) return;
    setHeard((before) => ({
      round: event.round_id,
      locked: mergeLocked(before.round === event.round_id ? before.locked : [], event.locked),
      of: event.of,
    }));
  });
  const heardNow = heard.round === roundId ? heard : { locked: [] as string[], of: null };
  const own = lockState.kind === 'locked' ? lockState : null;
  const locked = mergeLocked(
    mergeLocked(progress.data?.locked ?? [], heardNow.locked),
    own?.locked ?? [],
  );
  const of = heardNow.of ?? own?.of ?? progress.data?.of ?? null;
  const row = rowSeats(seatsData);
  const lit = lockedInRow(locked, row);
  const allLocked = everyoneLocked(locked, of);

  // Zero.
  const [ended, setEnded] = useState(false);
  const onEnd = () => setEnded(true);

  const noOpenRound = !!rounds.data && !round;
  const phase = phaseOf({
    ready: !!round && seedOrder.length > 0 && (!!cards.data || cards.isError),
    lockIn: lockState.kind,
    meLocked: progress.data?.me_locked ?? false,
    ended,
    everyoneLocked: allLocked,
    noOpenRound,
  });

  // Closing: the phone calls 2 seconds after the deadline, again each second until it answers.
  useEffect(() => {
    if (!roundId || !deadline) return;
    const closer = createCloser(async () => {
      const result = await api.closeRoundStage({ round_id: roundId });
      // The room moves on `state_changed`; a read here covers a missed event.
      if (result.status !== 'not_yet') {
        void queryClient.invalidateQueries({ queryKey: ROOM_KEY(roomId), exact: true });
      }
      return result;
    });
    closer.start(closeDelay(deadline));
    return () => closer.stop();
  }, [roundId, roomId, deadline, queryClient]);

  // A round that closed before this phone read it: the room is read again.
  useEffect(() => {
    if (noOpenRound)
      void queryClient.invalidateQueries({ queryKey: ROOM_KEY(roomId), exact: true });
  }, [noOpenRound, roomId, queryClient]);

  // Counting the votes admits it after a while.
  const counting = phase === 'counting';
  const [countingSlow, setCountingSlow] = useState(false);
  useEffect(() => {
    if (!counting) return;
    const timer = setTimeout(() => setCountingSlow(true), SLOW_COUNT_MS);
    return () => clearTimeout(timer);
  }, [counting]);

  const status = statusKey({
    phase,
    online,
    sendFailed: lockState.kind === 'idle' && lockState.error,
    liftVetoHint,
    countingSlow,
  });

  const places = placesOf(seedOrder, ballot);

  function onTap(titleId: number) {
    if (!takesTaps(phase)) return;
    const next = tapFinalist(ballot, titleId);
    if (next === ballot) {
      // The vetoed poster: nothing changes and nothing buzzes; the line says how to lift it.
      setLiftVetoHint(true);
      return;
    }
    haptics.press();
    setLiftVetoHint(false);
    setBallot(next);
  }

  function onLongPress(titleId: number) {
    if (!takesTaps(phase) || !canVeto) return;
    const next = pressFinalist(ballot, titleId, canVeto);
    // `veto()` is for a veto landing on a poster that had none anywhere.
    if (ballot.veto === null && next.veto !== null) haptics.veto();
    setLiftVetoHint(false);
    setBallot(next);
  }

  function onLockIn() {
    if (phase !== 'voting' || !lockIn) return;
    lockIn.submit(ballotToSend(seedOrder, ballot));
  }

  const finalists = finalistViews(seedOrder, cards.data, imageBase, width);

  return {
    kind,
    phase,
    loadFailed: (rounds.isError && !rounds.data) || (candidates.isError && !candidates.data),
    postersFailed: cards.isError && !cards.data,
    slots: seedOrder.length || 3,
    finalists,
    places,
    vetoAllowed: canVeto,
    deadline,
    countdownOn: !!deadline && !counting,
    tick: ticks(phase),
    seats: row.map((seat) => ({
      memberId: seat.member_id,
      name: seat.display_name,
      avatarKey: seat.avatar_key,
      locked: lit.has(seat.member_id),
    })),
    count: lockedCount(locked, row, of),
    of: of ?? row.length,
    status,
    meLocked: progress.data?.me_locked ?? false,
    numbersHidden: (progress.data?.me_locked ?? false) && lockState.kind === 'idle',
    online,
    onTap,
    onLongPress,
    onLockIn,
    onEnd,
    retryLoad: () => {
      void rounds.refetch();
      void candidates.refetch();
    },
    retryPosters: () => void cards.refetch(),
  };
}

const NEVER = () => () => {};
const IDLE_STATE = (): LockInState => IDLE;
const IDLE: LockInState = { kind: 'idle', error: false };

import type { Card } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { FinalCutScreen } from '@/components/screens/final-cut/final-cut-screen';
import { fixturePosters } from '@/components/gallery';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import {
  EMPTY_BALLOT,
  placesOf,
  pressFinalist,
  tapFinalist,
  tapPick,
  type Ballot,
} from '@/features/finale/ballot';
import { phaseOf, statusKey, takesTaps, ticks } from '@/features/finale/phase';
import { finalistCardsQuery } from '@/features/finale/queries';
import type { RevealData } from '@/features/finale/reveal';
import { revealStore, useRevealOf } from '@/features/finale/reveal-store';
import type { FinalistView } from '@/features/finale/rounds';
import { useRevealView } from '@/features/finale/use-reveal';
import type { FinalCutModel, LockInSeat } from '@/features/finale/use-final-cut';
import { LeaveContext } from '@/features/lobby/leave-context';
import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

// The Final Cut on fixture data, for the gestures, the ranked vote, the largest text size and the
// feel check (Dev menu, Tools). No room: the other seats lock in after this phone, and the round
// counts at zero. The haptics are the real ones.

const NAMES = ['Léa', 'Sam', 'Jo', 'Maya', 'Noé', 'Inès', 'Hugo', 'Zoé', 'Tom', 'Alix'] as const;
const KEYS = ['blue', 'green', 'gold', 'red', 'violet', 'teal'] as const;

const FILMS: FinalistView[] = [
  { titleId: 1, title: 'Neon Harbor', year: 2021, poster: fixturePosters.neonHarbor },
  { titleId: 2, title: 'The Paper Comet', year: 2019, poster: fixturePosters.paperComet },
  { titleId: 3, title: 'Midnight Matinee', year: 2023, poster: fixturePosters.midnightMatinee },
  { titleId: 4, title: 'Southbound Summer', year: 2018, poster: fixturePosters.southboundSummer },
].map((film) => ({ ...film, placeholder: null, noPoster: false, hasSynopsis: false }));

type Fixture = {
  label: string;
  films: number;
  kind: 'final_cut' | 'ranked_vote';
  vetoes: number;
  seats: number;
  longTitle?: boolean;
  seconds: number;
};

const FIXTURES: Fixture[] = [
  {
    label: 'Final Cut, 3 finalists',
    films: 3,
    kind: 'final_cut',
    vetoes: 1,
    seats: 4,
    seconds: 60,
  },
  {
    label: 'Final Cut, 2 finalists',
    films: 2,
    kind: 'final_cut',
    vetoes: 1,
    seats: 3,
    seconds: 60,
  },
  {
    label: 'Pick one, 2 finalists',
    films: 2,
    kind: 'ranked_vote',
    vetoes: 0,
    seats: 3,
    seconds: 60,
  },
  {
    label: 'Ranked vote, 4 finalists',
    films: 4,
    kind: 'ranked_vote',
    vetoes: 0,
    seats: 6,
    seconds: 60,
  },
  { label: 'No veto left', films: 3, kind: 'final_cut', vetoes: 0, seats: 4, seconds: 60 },
  { label: '12 seconds left', films: 3, kind: 'final_cut', vetoes: 1, seats: 4, seconds: 12 },
  {
    label: 'Long title, 10 seats',
    films: 4,
    kind: 'final_cut',
    vetoes: 1,
    seats: 10,
    longTitle: true,
    seconds: 60,
  },
];

const f = (titleId: number, seed: number, points: number, vetoed = false) => ({
  titleId,
  seed,
  points,
  vetoed,
});

// The reveal on fixture data (final-cut.md#the-reveal): the round has just closed.
const REVEALS: { label: string; data: RevealData }[] = [
  {
    label: 'Reveal: knock-out, points, 4 films',
    data: {
      winnerId: 1,
      reason: 'points',
      finalists: [f(1, 1, 40), f(2, 2, 30), f(3, 3, 20), f(4, 4, 0, true)],
    },
  },
  {
    label: 'Reveal: 2 players, no points',
    data: { winnerId: 2, reason: 'points', finalists: [f(1, 1, 2, true), f(2, 2, 2)] },
  },
  {
    label: 'Reveal: only unvetoed',
    data: {
      winnerId: 3,
      reason: 'only_unvetoed',
      finalists: [f(1, 1, 0, true), f(2, 2, 0, true), f(3, 3, 0)],
    },
  },
  {
    label: 'Reveal: nobody voted',
    data: { winnerId: 1, reason: 'no_ballots', finalists: [f(1, 1, 0), f(2, 2, 0), f(3, 3, 0)] },
  },
  {
    label: 'Reveal: a tie',
    data: {
      winnerId: 1,
      reason: 'points',
      finalists: [f(1, 1, 20), f(2, 2, 20), f(3, 3, 10), f(4, 4, 10)],
    },
  },
];

function RevealFixtured({ data, onExit }: { data: RevealData; onExit: () => void }) {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [ready] = useState(() => {
    // The cards are seeded, so the reveal needs no room; the posters are the gallery's.
    const ids = data.finalists.map((x) => x.titleId);
    const cards = ids.map((id) => {
      const film = FILMS.find((x) => x.titleId === id);
      return {
        title_id: id,
        title: film?.title ?? '',
        year: film?.year ?? null,
      } as unknown as Card;
    });
    queryClient.setQueryData(finalistCardsQuery('dev', ids, i18n.language).queryKey, cards);
    revealStore.getState().reset();
    revealStore.getState().play('dev', data, true);
    return true;
  });
  const posters = Object.fromEntries(FILMS.map((film) => [film.titleId, film.poster]));
  const reveal = useRevealView('dev', i18n.language, posters as never);
  const phase = useRevealOf('dev').phase;
  useEffect(() => {
    if (phase === 'over') onExit();
  }, [phase, onExit]);
  if (!ready) return null;
  const model: FinalCutModel = {
    kind: 'final_cut',
    pickOne: false,
    phase: 'counting',
    loadFailed: false,
    postersFailed: false,
    slots: data.finalists.length,
    finalists: [],
    places: new Map(),
    vetoAllowed: false,
    deadline: null,
    countdownOn: false,
    tick: false,
    seats: [],
    count: 0,
    of: 0,
    status: null,
    meLocked: false,
    numbersHidden: false,
    online: true,
    onTap: () => undefined,
    onLongPress: () => undefined,
    onInfo: () => undefined,
    onLockIn: () => undefined,
    onEnd: () => undefined,
    retryLoad: () => undefined,
    retryPosters: () => undefined,
  };
  return (
    <LeaveContext.Provider value={onExit}>
      <FinalCutScreen roomId="dev" model={model} reveal={reveal} />
    </LeaveContext.Provider>
  );
}

function Fixtured({ fixture, onExit }: { fixture: Fixture; onExit: () => void }) {
  const [deadline] = useState(() => new Date(Date.now() + fixture.seconds * 1000).toISOString());
  const [ballot, setBallot] = useState<Ballot>(EMPTY_BALLOT);
  const [lock, setLock] = useState<'idle' | 'sending' | 'locked'>('idle');
  const [ended, setEnded] = useState(false);
  const [others, setOthers] = useState(0);
  const [liftVetoHint, setLiftVetoHint] = useState(false);

  const films = FILMS.slice(0, fixture.films).map((film, i) =>
    fixture.longTitle && i === 0
      ? {
          ...film,
          title: 'The Extraordinarily Long Adventures of Captain Meridian and the Paper Comet',
        }
      : film,
  );
  const seedOrder = films.map((f) => f.titleId);
  const pickOne = fixture.kind === 'ranked_vote' && fixture.films === 2;
  const canVeto = fixture.kind === 'final_cut' && fixture.vetoes > 0;

  // The other seats lock in after this phone does, one every 2.5 seconds.
  useEffect(() => {
    if (lock !== 'locked' || others >= fixture.seats - 1) return;
    const timer = setTimeout(() => setOthers((n) => n + 1), 2500);
    return () => clearTimeout(timer);
  }, [lock, others, fixture.seats]);

  const seats: LockInSeat[] = NAMES.slice(0, fixture.seats).map((name, i) => ({
    memberId: name,
    name,
    avatarKey: KEYS[i % KEYS.length] ?? 'blue',
    locked: i === 0 ? lock === 'locked' : i <= others,
  }));
  const count = seats.filter((s) => s.locked).length;
  const phase = phaseOf({
    ready: true,
    lockIn: lock === 'idle' ? 'idle' : lock,
    meLocked: false,
    ended,
    everyoneLocked: count === fixture.seats,
    noOpenRound: false,
  });

  function lockIn() {
    if (phase !== 'voting') return;
    setLock('sending');
    setTimeout(() => setLock('locked'), 900);
  }

  const model: FinalCutModel = {
    kind: fixture.kind,
    pickOne,
    phase,
    loadFailed: false,
    postersFailed: false,
    slots: films.length,
    finalists: films,
    places: placesOf(seedOrder, ballot),
    vetoAllowed: canVeto,
    deadline,
    countdownOn: phase !== 'counting',
    tick: ticks(phase),
    seats,
    count,
    of: fixture.seats,
    status: statusKey({
      phase,
      online: true,
      sendFailed: false,
      liftVetoHint,
      countingSlow: false,
    }),
    meLocked: false,
    numbersHidden: false,
    online: true,
    onTap: (id) => {
      if (!takesTaps(phase)) return;
      const next = pickOne ? tapPick(ballot, id) : tapFinalist(ballot, id);
      if (next === ballot) return setLiftVetoHint(true);
      haptics.press();
      setLiftVetoHint(false);
      setBallot(next);
    },
    onInfo: () => undefined,
    onLongPress: (id) => {
      if (!takesTaps(phase) || !canVeto) return;
      const next = pressFinalist(ballot, id, canVeto);
      if (ballot.veto === null && next.veto !== null) {
        haptics.veto();
        void playSound('veto');
      }
      setLiftVetoHint(false);
      setBallot(next);
    },
    onLockIn: lockIn,
    onEnd: () => setEnded(true),
    retryLoad: () => undefined,
    retryPosters: () => undefined,
  };

  return (
    <LeaveContext.Provider value={onExit}>
      <FinalCutScreen roomId="dev" model={model} />
    </LeaveContext.Provider>
  );
}

export default function DevFinalCutScreen() {
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [revealing, setRevealing] = useState<RevealData | null>(null);
  if (!__DEV__) return <Redirect href="/" />;
  if (revealing) return <RevealFixtured data={revealing} onExit={() => setRevealing(null)} />;
  if (fixture) return <Fixtured fixture={fixture} onExit={() => setFixture(null)} />;
  return (
    <Screen scroll header={<TopBar title="Final Cut" onBack={() => router.back()} />}>
      <View className="flex-1 justify-center gap-4">
        <Text tone="secondary">
          The Final Cut on fixture data. The other seats lock in after you do; the leave button
          comes back here.
        </Text>
        {FIXTURES.map((item) => (
          <Button
            key={item.label}
            label={item.label}
            variant="secondary"
            onPress={() => setFixture(item)}
          />
        ))}
        {REVEALS.map((item) => (
          <Button
            key={item.label}
            label={item.label}
            variant="secondary"
            onPress={() => setRevealing(item.data)}
          />
        ))}
      </View>
    </Screen>
  );
}

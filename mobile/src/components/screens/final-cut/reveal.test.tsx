import i18n from '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { matchShownStore } from '@/features/room/match-shown';
import { revealStore } from '@/features/finale/reveal-store';
import type { RevealData } from '@/features/finale/reveal';
import { revealPlan } from '@/features/finale/reveal';
import { useRevealView } from '@/features/finale/use-reveal';
import type { FinalCutModel } from '@/features/finale/use-final-cut';
import { LeaveContext } from '@/features/lobby/leave-context';
import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

import { FinalCutScreen } from './final-cut-screen';

jest.mock('@/components/screens/room/room-banner', () => ({ RoomBanner: () => null }));
jest.mock('@/components/shared/poster', () => ({ Poster: () => null }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/haptics', () => ({
  haptics: { press: jest.fn(), veto: jest.fn(), match: jest.fn(), countdown: jest.fn() },
}));
jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: undefined }),
}));
const card = (id: number, title: string) => ({
  title_id: id,
  title,
  year: 2020,
  poster_path: null,
  poster_placeholder: null,
});
jest.mock('@/api', () => ({
  api: {
    titleCards: jest.fn(async () => ({
      status: 'ok',
      cards: [card(10, 'Alpha'), card(20, 'Beta'), card(30, 'Gamma'), card(40, 'Delta')],
    })),
  },
}));

const f = (titleId: number, seed: number, points: number, vetoed = false) => ({
  titleId,
  seed,
  points,
  vetoed,
});

const model = (): FinalCutModel =>
  ({
    kind: 'final_cut',
    phase: 'counting',
    loadFailed: false,
    postersFailed: false,
    slots: 3,
    finalists: [],
    places: new Map(),
    vetoAllowed: true,
    deadline: new Date(Date.now() + 40_000).toISOString(),
    countdownOn: true,
    tick: false,
    seats: [{ memberId: 'a', name: 'Léa', avatarKey: 'teal', locked: true }],
    count: 1,
    of: 1,
    status: null,
    meLocked: false,
    numbersHidden: false,
    online: true,
    onTap: jest.fn(),
    onLongPress: jest.fn(),
    onLockIn: jest.fn(),
    onEnd: jest.fn(),
    retryLoad: jest.fn(),
    retryPosters: jest.fn(),
  }) as FinalCutModel;

function Harness() {
  const reveal = useRevealView('r1', 'en');
  return <FinalCutScreen roomId="r1" model={model()} reveal={reveal} />;
}

async function play(data: RevealData) {
  await i18n.changeLanguage('en');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  revealStore.getState().play('r1', data);
  const view = await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 667 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <LeaveContext.Provider value={jest.fn()}>
          <Harness />
        </LeaveContext.Provider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await act(async () => undefined);
  return view;
}

const withKnockout: RevealData = {
  winnerId: 10,
  reason: 'points',
  finalists: [f(10, 1, 40), f(20, 2, 30), f(30, 3, 20), f(40, 4, 0, true)],
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  matchShownStore.setState({ rooms: [] });
  revealStore.getState().reset();
});
afterEach(() => jest.useRealTimers());

const advance = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

describe('the reveal', () => {
  it('plays once: the sound at 0, the veto at the knock-outs, the match buzz at the winner', async () => {
    await play(withKnockout);
    const plan = revealPlan(withKnockout);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('reveal');
    expect(haptics.veto).not.toHaveBeenCalled();
    await advance(plan.knockouts ?? 0);
    expect(haptics.veto).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Delta, 2020. Vetoed/)).toBeTruthy();
    await advance(plan.winner - (plan.knockouts ?? 0));
    expect(haptics.match).toHaveBeenCalledTimes(1);
    expect(haptics.veto).toHaveBeenCalledTimes(1);
    expect(matchShownStore.getState().has('r1')).toBe(true);
    // the route is held until the hand-over
    expect(revealStore.getState().phase).toBe('playing');
    await advance(plan.handOver - plan.winner);
    expect(revealStore.getState().phase).toBe('over');
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it('shows the points on the films still in, and never on a knocked-out one', async () => {
    await play(withKnockout);
    await advance(revealPlan(withKnockout).points ?? 0);
    await advance(1000);
    expect(
      screen.getByLabelText(/Alpha, 2020. Tonight's pick, 40 points|Alpha, 2020. 40 points/),
    ).toBeTruthy();
    expect(screen.getByText('40 pts')).toBeTruthy();
    expect(screen.queryByText('0 pts')).toBeNull();
  });

  it('says the only-unvetoed line, with no points', async () => {
    await play({
      winnerId: 10,
      reason: 'only_unvetoed',
      finalists: [f(10, 1, 0), f(20, 2, 0, true), f(30, 3, 0, true)],
    });
    await advance(revealPlan(revealStore.getState().data!).winner);
    expect(screen.getByText('The only film nobody vetoed')).toBeTruthy();
    expect(screen.queryByText(/pts/)).toBeNull();
  });

  it('says the no-ballots line at the winner step alone', async () => {
    await play({
      winnerId: 10,
      reason: 'no_ballots',
      finalists: [f(10, 1, 0), f(20, 2, 0), f(30, 3, 0)],
    });
    await advance(300);
    expect(screen.getByText('Top of your swipes')).toBeTruthy();
    expect(haptics.veto).not.toHaveBeenCalled();
    expect(haptics.match).toHaveBeenCalledTimes(1);
  });

  it('shows no seat name or lock-in row', async () => {
    await play(withKnockout);
    await advance(revealPlan(withKnockout).winner);
    expect(screen.queryByText('Léa')).toBeNull();
    expect(screen.queryByText(/locked in/i)).toBeNull();
  });

  it('goes on with a tap once the winner shows, and not before', async () => {
    await play(withKnockout);
    expect(screen.queryByTestId('reveal-tap', { includeHiddenElements: true })).toBeNull();
    await advance(revealPlan(withKnockout).winner);
    await fireEvent.press(screen.getByTestId('reveal-tap', { includeHiddenElements: true }));
    expect(revealStore.getState().phase).toBe('over');
  });

  it('with a screen reader: one announcement and a button, no automatic hand-over', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await play(withKnockout);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toMatch(/Vetoed: Delta\. Tonight's pick: Alpha\./);
    const plan = revealPlan(withKnockout);
    await advance(plan.handOver + 5000);
    expect(revealStore.getState().phase).toBe('playing');
    const button = screen.getByLabelText('See where to watch Alpha');
    await fireEvent.press(button);
    expect(revealStore.getState().phase).toBe('over');
  });
});

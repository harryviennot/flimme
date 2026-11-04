import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { haptics } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';

import { useFinalCut } from './use-final-cut';

const NOW = Date.parse('2026-11-04T10:00:00Z');

const mockApi = {
  rounds: jest.fn(),
  roundCandidates: jest.fn(),
  titleCards: jest.fn(),
  roundProgress: jest.fn(),
  castBallot: jest.fn(),
  closeRoundStage: jest.fn(),
};
jest.mock('@/api', () => ({
  get api() {
    return mockApi;
  },
}));
const mockEvents = new Map<string, (payload: unknown) => void>();
const mockSeats = { current: [] as unknown[] };
const mockExit = jest.fn();
jest.mock('@/features/room', () => ({
  ROOM_KEY: (id: string) => ['room', id],
  SEATS_KEY: (id: string) => ['room', id, 'seats'],
  mySeatOf: (seats: { is_me?: boolean; left_at: string | null }[] | undefined) =>
    seats?.find((s) => s.is_me && s.left_at === null) ?? null,
  useRoomSeats: () => ({ data: mockSeats.current }),
  useRoomEvent: (_room: string, event: string, handler: (payload: unknown) => void) => {
    mockEvents.set(event, handler);
  },
  useExitRoomToHome: () => mockExit,
}));
const mockOnline = { value: true };
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.value }));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://img' } }),
}));
jest.mock('@/lib/haptics', () => ({
  haptics: { press: jest.fn(), veto: jest.fn(), countdown: jest.fn() },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/features/match/use-match-card', () => ({ heldCardOf: () => undefined }));

const seat = (id: string, vetoes: number | null = 1, me = false) => ({
  member_id: id,
  display_name: id.toUpperCase(),
  avatar_key: 'teal',
  joined_at: `2026-11-04T09:00:0${id.charCodeAt(0) - 96}Z`,
  left_at: null,
  is_me: me,
  vetoes_left: vetoes,
});

const card = (id: number) => ({
  title_id: id,
  title: `Film ${id}`,
  year: 2020,
  poster_path: `/p${id}.jpg`,
  poster_placeholder: null,
});

const round = (
  kind: 'final_cut' | 'ranked_vote' = 'final_cut',
  closes = '2026-11-04T10:00:42Z',
) => ({
  id: 'round-1',
  room_id: 'r1',
  seq: 1,
  kind,
  stage: 'vote',
  stage_closes_at: closes,
  opened_at: '2026-11-04T10:00:00Z',
  closed_at: null,
  winner_title_id: null,
});

function setup(
  options: { kind?: 'final_cut' | 'ranked_vote'; vetoes?: number; closes?: string } = {},
) {
  mockSeats.current = [seat('a', options.vetoes ?? 1, true), seat('b', null), seat('c', null)];
  mockApi.rounds.mockResolvedValue([round(options.kind, options.closes)]);
  mockApi.roundCandidates.mockResolvedValue(
    [10, 20, 30].map((title_id, i) => ({
      round_id: 'round-1',
      title_id,
      seed: i + 1,
      points: 0,
      vetoed: false,
    })),
  );
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [10, 20, 30].map(card) });
  mockApi.roundProgress.mockResolvedValue({
    status: 'ok',
    stage: 'vote',
    closes_at: '2026-11-04T10:00:42Z',
    locked: [],
    of: 3,
    me_locked: false,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useFinalCut('r1', 'fr'), { wrapper });
}

const settle = async () => {
  // Queries and their notifications ride on timers and promises: let both run.
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
    });
  }
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  mockEvents.clear();
  mockOnline.value = true;
});
afterEach(() => jest.useRealTimers());

describe('the Final Cut model', () => {
  it('ranks by tapping and sends the tapped films, then the rest in seed order', async () => {
    mockApi.castBallot.mockResolvedValue({ status: 'ok', locked: ['a'], of: 3 });
    const { result } = await setup();
    await settle();
    expect(result.current.phase).toBe('voting');
    await act(async () => result.current.onTap(30));
    expect(haptics.press).toHaveBeenCalledTimes(1);
    expect(result.current.places.get(30)).toEqual({ kind: 'ranked', rank: 1 });
    expect(result.current.places.get(10)).toEqual({ kind: 'faint', rank: 2 });
    await act(async () => result.current.onLockIn());
    await settle();
    expect(mockApi.castBallot).toHaveBeenCalledWith({
      round_id: 'round-1',
      ranking: [30, 10, 20],
      veto: undefined,
    });
  });

  it('vetoes with a long press, buzzes once, and sends the veto apart', async () => {
    mockApi.castBallot.mockResolvedValue({ status: 'ok', locked: ['a'], of: 3 });
    const { result } = await setup();
    await settle();
    await act(async () => result.current.onLongPress(20));
    expect(haptics.veto).toHaveBeenCalledTimes(1);
    expect(result.current.places.get(20)).toEqual({ kind: 'vetoed' });
    // Moving it is silent.
    await act(async () => result.current.onLongPress(30));
    expect(haptics.veto).toHaveBeenCalledTimes(1);
    // Tapping the vetoed poster does nothing and says how to lift it.
    await act(async () => result.current.onTap(30));
    expect(result.current.places.get(30)).toEqual({ kind: 'vetoed' });
    expect(result.current.status).toBe('hint.liftVeto');
    await act(async () => result.current.onLockIn());
    await settle();
    expect(mockApi.castBallot).toHaveBeenCalledWith({
      round_id: 'round-1',
      ranking: [10, 20],
      veto: 30,
    });
  });

  it('has no veto control in a ranked vote or with no veto left', async () => {
    const ranked = await setup({ kind: 'ranked_vote' });
    await settle();
    expect(ranked.result.current.vetoAllowed).toBe(false);
    await act(async () => ranked.result.current.onLongPress(10));
    expect(ranked.result.current.places.get(10)).toEqual({ kind: 'faint', rank: 1 });
    expect(haptics.veto).not.toHaveBeenCalled();
    const spent = await setup({ vetoes: 0 });
    await settle();
    expect(spent.result.current.vetoAllowed).toBe(false);
  });

  it('sends one ballot for a double tap, then shows locked in', async () => {
    let resolve: (answer: unknown) => void = () => {};
    mockApi.castBallot.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await setup();
    await settle();
    await act(async () => {
      result.current.onLockIn();
      result.current.onLockIn();
    });
    expect(result.current.phase).toBe('sending');
    await act(async () => resolve({ status: 'ok', locked: ['a'], of: 3 }));
    await settle();
    expect(mockApi.castBallot).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('locked');
    expect(result.current.tick).toBe(false);
    expect(result.current.count).toBe(1);
    // Locked in: taps change nothing.
    await act(async () => result.current.onTap(10));
    expect(result.current.places.get(10)).toEqual({ kind: 'faint', rank: 1 });
  });

  it('reads already_voted as locked in', async () => {
    mockApi.castBallot.mockResolvedValue({ status: 'already_voted' });
    const { result } = await setup();
    await settle();
    await act(async () => result.current.onLockIn());
    await settle();
    expect(result.current.phase).toBe('locked');
  });

  it('shows Counting the votes for closed and goes Home for not_in_room', async () => {
    mockApi.castBallot.mockResolvedValue({ status: 'closed' });
    const closed = await setup();
    await settle();
    await act(async () => closed.result.current.onLockIn());
    await settle();
    expect(closed.result.current.phase).toBe('counting');
    mockApi.castBallot.mockResolvedValue({ status: 'not_in_room' });
    const left = await setup();
    await settle();
    await act(async () => left.result.current.onLockIn());
    await settle();
    expect(mockExit).toHaveBeenCalled();
  });

  it('reports invalid, unfreezes and says the vote did not go through', async () => {
    mockApi.castBallot.mockResolvedValue({ status: 'invalid' });
    const { result } = await setup();
    await settle();
    await act(async () => result.current.onLockIn());
    await settle();
    expect(reportError).toHaveBeenCalled();
    expect(result.current.phase).toBe('voting');
    expect(result.current.status).toBe('error.send');
  });

  it('reports no_veto and reads the seat again', async () => {
    mockApi.castBallot.mockResolvedValue({ status: 'no_veto' });
    const { result } = await setup();
    await settle();
    await act(async () => result.current.onLockIn());
    await settle();
    expect(reportError).toHaveBeenCalled();
    expect(result.current.status).toBe('error.send');
  });

  it('stays sending offline and sends again each second', async () => {
    mockOnline.value = false;
    mockApi.castBallot
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ status: 'ok', locked: ['a'], of: 3 });
    const { result } = await setup();
    await settle();
    await act(async () => result.current.onLockIn());
    await settle();
    expect(result.current.phase).toBe('sending');
    expect(result.current.status).toBe('hint.offline');
    await act(async () => void jest.advanceTimersByTime(1_000));
    await settle();
    expect(result.current.phase).toBe('locked');
  });
});

describe('the countdown and the close', () => {
  it('never shows more than 60 seconds', async () => {
    const { result } = await setup({ closes: '2026-11-04T10:30:00Z' });
    await settle();
    expect(Date.parse(result.current.deadline ?? '') - NOW).toBeLessThanOrEqual(60_000);
  });

  it('counts the votes at zero, closes at zero plus 2 seconds, retries on not_yet, then stops', async () => {
    mockApi.closeRoundStage
      .mockResolvedValueOnce({ status: 'not_yet', closes_at: 'x' })
      .mockResolvedValue({ status: 'ok', winner_title_id: 10 });
    const { result } = await setup();
    await settle();
    expect(result.current.countdownOn).toBe(true);
    await act(async () => result.current.onEnd());
    expect(result.current.phase).toBe('counting');
    expect(result.current.countdownOn).toBe(false);
    // The phone never locked in: it sends nothing at zero.
    await act(async () => result.current.onLockIn());
    expect(mockApi.castBallot).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(43_999));
    expect(mockApi.closeRoundStage).not.toHaveBeenCalled();
    await act(async () => void jest.advanceTimersByTime(1));
    await settle();
    expect(mockApi.closeRoundStage).toHaveBeenCalledTimes(1);
    await act(async () => void jest.advanceTimersByTime(1_000));
    await settle();
    expect(mockApi.closeRoundStage).toHaveBeenCalledTimes(2);
    await act(async () => void jest.advanceTimersByTime(5_000));
    expect(mockApi.closeRoundStage).toHaveBeenCalledTimes(2);
  });

  it('admits it is still counting after 10 seconds', async () => {
    const { result } = await setup();
    await settle();
    await act(async () => result.current.onEnd());
    expect(result.current.status).toBeNull();
    await act(async () => void jest.advanceTimersByTime(10_000));
    expect(result.current.status).toBe('counting.slow');
  });
});

describe('who has locked in', () => {
  it('reads the progress on open, in seat order, with the count', async () => {
    const { result } = await setup();
    mockApi.roundProgress.mockResolvedValue({
      status: 'ok',
      stage: 'vote',
      closes_at: 'x',
      locked: ['b'],
      of: 3,
      me_locked: true,
    });
    await settle();
    expect(result.current.seats.map((s) => s.memberId)).toEqual(['a', 'b', 'c']);
    expect(result.current.seats.find((s) => s.memberId === 'b')?.locked).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it('lights seats from round_progress events and counts to everyone locked', async () => {
    const { result } = await setup();
    await settle();
    await act(async () =>
      mockEvents.get('round_progress')?.({ round_id: 'round-1', locked: ['b'], of: 3 }),
    );
    expect(result.current.seats.find((s) => s.memberId === 'b')?.locked).toBe(true);
    expect(result.current.count).toBe(1);
    // Another round's event is ignored.
    await act(async () =>
      mockEvents.get('round_progress')?.({ round_id: 'other', locked: ['c'], of: 3 }),
    );
    expect(result.current.count).toBe(1);
    // Everyone locked in: the countdown leaves at once.
    await act(async () =>
      mockEvents.get('round_progress')?.({ round_id: 'round-1', locked: ['a', 'b', 'c'], of: 3 }),
    );
    expect(result.current.phase).toBe('counting');
    expect(result.current.countdownOn).toBe(false);
  });

  it('shows locked in for a restart where the server says this seat locked in', async () => {
    mockSeats.current = [seat('a', 1, true), seat('b', null)];
    const { result } = await setup();
    mockApi.roundProgress.mockResolvedValue({
      status: 'ok',
      stage: 'vote',
      closes_at: 'x',
      locked: ['a'],
      of: 3,
      me_locked: true,
    });
    await act(async () => void (await result.current));
    await settle();
    expect(result.current.phase).toBe('locked');
  });
});

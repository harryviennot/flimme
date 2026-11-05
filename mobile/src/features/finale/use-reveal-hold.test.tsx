import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { matchShownStore } from '../room/match-shown';
import { revealStore } from './reveal-store';
import { useRevealHold } from './use-reveal-hold';

const mockApi = { rounds: jest.fn(), roundCandidates: jest.fn(), titleCards: jest.fn() };
jest.mock('@/api', () => ({
  get api() {
    return mockApi;
  },
}));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type Handler = (payload: unknown) => void;
function fakeRealtime() {
  const handlers: Handler[] = [];
  return {
    listen: (_event: string, handler: Handler) => {
      handlers.push(handler);
      return () => void handlers.splice(handlers.indexOf(handler), 1);
    },
    emit: (payload: unknown) => handlers.forEach((h) => h(payload)),
  };
}

const event = {
  title_id: 1,
  kind: 'finale',
  decided: true,
  likes: 2,
  of: 3,
  reason: 'points',
  finalists: [
    { title_id: 1, seed: 1, points: 12, vetoed: false },
    { title_id: 2, seed: 2, points: 6, vetoed: false },
    { title_id: 3, seed: 3, points: 0, vetoed: true },
  ],
};
const closed = {
  id: 'rd1',
  room_id: 'r1',
  seq: 1,
  kind: 'final_cut',
  stage: 'closed',
  stage_closes_at: '',
  opened_at: '',
  closed_at: '',
  winner_title_id: 1,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.rounds.mockReset();
  mockApi.roundCandidates.mockReset();
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [] });
  matchShownStore.setState({ rooms: [] });
  revealStore.getState().reset();
});

async function hold(
  state: 'finale' | 'done',
  current: string,
  realtime = fakeRealtime(),
  roomId = 'r1',
) {
  const view = await renderHook(
    (props: { state: 'finale' | 'done' }) => useRevealHold(roomId, props.state, current, realtime),
    { wrapper, initialProps: { state } },
  );
  return { ...view, realtime };
}

describe('the finale event', () => {
  it('starts one reveal and holds the route until it finishes', async () => {
    const { result, rerender, realtime } = await hold('finale', 'final-cut');
    expect(result.current).toBe(false);
    await act(async () => realtime.emit(event));
    expect(result.current).toBe(true);
    // the room goes `done`: the layout still must not move
    await rerender({ state: 'done' });
    expect(result.current).toBe(true);
    expect(revealStore.getState().phase).toBe('playing');
    // the event twice: one reveal
    const data = revealStore.getState().data;
    await act(async () => realtime.emit(event));
    expect(revealStore.getState().data).toBe(data);
    // at the hand-over the hold ends
    await act(async () => revealStore.getState().finish('r1'));
    expect(result.current).toBe(false);
    // and a late third event plays nothing
    await act(async () => realtime.emit(event));
    expect(revealStore.getState().phase).toBe('over');
    expect(mockApi.rounds).not.toHaveBeenCalled();
  });

  it('plays nothing for the single-film pick or a room already shown', async () => {
    const { result, realtime } = await hold('finale', 'final-cut');
    await act(async () => realtime.emit({ ...event, reason: 'only_film', finalists: undefined }));
    expect(result.current).toBe(false);
    matchShownStore.getState().mark('r1');
    await act(async () => realtime.emit(event));
    expect(result.current).toBe(false);
  });
});

describe('a phone that missed the event', () => {
  it('reads the closed round and plays it once', async () => {
    mockApi.rounds.mockResolvedValue([closed]);
    mockApi.roundCandidates.mockResolvedValue([
      { round_id: 'rd1', title_id: 1, seed: 1, points: 12, vetoed: false },
      { round_id: 'rd1', title_id: 2, seed: 2, points: 6, vetoed: false },
      { round_id: 'rd1', title_id: 3, seed: 3, points: 0, vetoed: true },
    ]);
    const { result } = await hold('done', 'swipe');
    // held from the first render, so no frame shows the winner screen
    expect(result.current).toBe(true);
    await waitFor(() => expect(revealStore.getState().phase).toBe('playing'));
    expect(revealStore.getState().data?.winnerId).toBe(1);
    expect(revealStore.getState().data?.finalists.find((x) => x.titleId === 3)?.vetoed).toBe(true);
    expect(mockApi.rounds).toHaveBeenCalledTimes(1);
  });

  it('plays a 2-film ranked vote once, from the candidates', async () => {
    mockApi.rounds.mockResolvedValue([{ ...closed, kind: 'ranked_vote' }]);
    mockApi.roundCandidates.mockResolvedValue([
      { round_id: 'rd1', title_id: 1, seed: 1, points: 6, vetoed: false },
      { round_id: 'rd1', title_id: 2, seed: 2, points: 3, vetoed: false },
    ]);
    const { result } = await hold('done', 'swipe');
    expect(result.current).toBe(true);
    await waitFor(() => expect(revealStore.getState().phase).toBe('playing'));
    const data = revealStore.getState().data;
    expect(data?.finalists).toHaveLength(2);
    expect(data?.reason).toBe('points');
    expect(data?.finalists.some((x) => x.vetoed)).toBe(false);
    expect(mockApi.rounds).toHaveBeenCalledTimes(1);
  });

  it('goes straight on when the room was already shown', async () => {
    matchShownStore.getState().mark('r1');
    const { result } = await hold('done', 'swipe');
    expect(result.current).toBe(false);
    expect(mockApi.rounds).not.toHaveBeenCalled();
  });

  it('lets a room with no Final Cut round move on without marking it shown', async () => {
    mockApi.rounds.mockResolvedValue([]);
    const { result } = await hold('done', 'swipe');
    await waitFor(() => expect(result.current).toBe(false));
    expect(matchShownStore.getState().has('r1')).toBe(false);
  });

  it('gives up after the read limit and counts the room as shown', async () => {
    jest.useFakeTimers();
    mockApi.rounds.mockImplementation(() => new Promise(() => undefined));
    const { result } = await hold('done', 'swipe');
    expect(result.current).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    expect(result.current).toBe(false);
    expect(matchShownStore.getState().has('r1')).toBe(true);
    jest.useRealTimers();
  });
});

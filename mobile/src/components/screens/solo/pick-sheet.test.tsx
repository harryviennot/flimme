import i18n from '@/i18n';

import type { NextCard } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';
import { forgetSoloSession, soloSessionOf } from '@/features/solo/session';
import { voteQueue } from '@/features/swipe';

import { PickSheet } from './pick-sheet';

let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));
jest.mock('@/api', () => ({ api: { soloPick: jest.fn() } }));
jest.mock('@/features/swipe', () => ({ voteQueue: { flush: jest.fn(), pending: jest.fn() } }));
jest.mock('@/features/room', () => ({ ROOM_KEY: (id: string) => ['room', id] }));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://image.test/t/p' } }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptics: { press: jest.fn(), error: jest.fn() } }));

const ROOM = 'r1';
const film = (id: number, over: Partial<NextCard> = {}) =>
  ({
    title_id: id,
    title: `Film ${id}`,
    year: 2020,
    poster_path: `/p${id}.jpg`,
    ...over,
  }) as NextCard;

const soloPick = api.soloPick as jest.Mock;

async function renderSheet() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <PickSheet roomId={ROOM} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  mockOnline = true;
  jest.clearAllMocks();
  (voteQueue.flush as jest.Mock).mockResolvedValue(undefined);
  (voteQueue.pending as jest.Mock).mockReturnValue(0);
  forgetSoloSession(ROOM);
  const session = soloSessionOf(ROOM).getState();
  session.answer(film(1), 'like');
  session.answer(film(2), 'nope');
  session.answer(film(3), 'super_like');
  session.answer(
    film(4, { poster_path: null, title: 'A very long title that goes on and on' }),
    'like',
  );
});

describe('the pick sheet', () => {
  it("lists this session's likes, super likes first and then newest first, without nopes", async () => {
    await renderSheet();
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string)
      .filter((l) => l.startsWith('Film') || l.startsWith('A very'));
    expect(labels).toEqual([
      'Film 3, 2020',
      'A very long title that goes on and on, 2020',
      'Film 1, 2020',
    ]);
    expect(screen.getByText('Which one tonight?')).toBeOnTheScreen();
  });

  it('sends the queued votes before it picks, then asks the room to be read again', async () => {
    soloPick.mockResolvedValue({ status: 'ok', title_id: 3 });
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Film 3, 2020'));
    await act(async () => {});
    expect((voteQueue.flush as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      soloPick.mock.invocationCallOrder[0]!,
    );
    expect(soloPick).toHaveBeenCalledWith({ room_id: ROOM, title_id: 3 });
  });

  it('takes a second tap while one pick is on its way for nothing', async () => {
    soloPick.mockReturnValue(new Promise(() => {}));
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Film 3, 2020'));
    await fireEvent.press(screen.getByLabelText('Film 3, 2020'));
    await fireEvent.press(screen.getByLabelText('Film 1, 2020'));
    await act(async () => {});
    expect(soloPick).toHaveBeenCalledTimes(1);
  });

  it('removes a film that is no longer liked and says so', async () => {
    soloPick.mockResolvedValue({ status: 'not_liked' });
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Film 3, 2020'));
    await act(async () => {});
    expect(screen.queryByLabelText('Film 3, 2020')).toBeNull();
    expect(showToast).toHaveBeenCalledWith({
      tone: 'warn',
      title: "That film isn't in your likes any more.",
    });
  });

  it('says it could not pick when the call fails or a vote still waits', async () => {
    soloPick.mockRejectedValue(new Error('x'));
    await renderSheet();
    await fireEvent.press(screen.getByLabelText('Film 3, 2020'));
    await act(async () => {});
    expect(showToast).toHaveBeenLastCalledWith({
      tone: 'warn',
      title: "We couldn't pick that film. Try again.",
    });
    (voteQueue.pending as jest.Mock).mockReturnValue(1);
    await fireEvent.press(screen.getByLabelText('Film 1, 2020'));
    await act(async () => {});
    expect(soloPick).toHaveBeenCalledTimes(1);
  });

  it('is offline: a banner, and the tiles do not take a press', async () => {
    mockOnline = false;
    await renderSheet();
    expect(screen.getByText("You're offline. Connect to pick.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Film 3, 2020'));
    expect(soloPick).not.toHaveBeenCalled();
  });
});

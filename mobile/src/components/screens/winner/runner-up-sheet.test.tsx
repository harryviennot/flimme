import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import i18n from '@/i18n';

import { RunnerUpSheet } from './runner-up-sheet';

jest.mock('@/api', () => ({ api: { roomRunnersUp: jest.fn(), titleCards: jest.fn() } }));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://image.tmdb.org/t/p' } }),
}));
jest.mock('@/features/room', () => ({ ROOM_KEY: (id: string) => ['room', id] }));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
jest.mock('@/features/my-films', () => ({ sheetCardProps: () => ({ title: 'Film 2' }) }));
jest.mock('@/components/shared/movie-card', () => ({
  MovieCard: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{title}</Text>;
  },
}));

const mockApi = api as unknown as Record<'roomRunnersUp' | 'titleCards', jest.Mock>;
const card = {
  title_id: 2,
  title: 'Film 2',
  poster_path: null,
  poster_placeholder: null,
  providers: [],
  watch_link: null,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  void i18n.changeLanguage('en');
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [card] });
});

describe('the runner-up sheet', () => {
  it('shows the card and where to watch, with no liker and no count', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'party',
      source: 'finalists',
      runners_up: [
        {
          title_id: 2,
          likes: 1,
          likers: [{ member_id: 'm', display_name: 'Ana', avatar_key: 'teal' }],
        },
      ],
    });
    const onClose = jest.fn();
    await render(<RunnerUpSheet roomId="r1" titleId={2} onClose={onClose} />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText('None of your services has it any more.')).toBeTruthy(),
    );
    expect(screen.queryByText(/Ana|like/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the film is not one of the runners-up', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'blind',
      source: 'finalists',
      runners_up: [{ title_id: 5, likes: 1 }],
    });
    const onClose = jest.fn();
    await render(<RunnerUpSheet roomId="r1" titleId={2} onClose={onClose} />, { wrapper });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('closes when the room is not finished', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({ status: 'not_finished' });
    const onClose = jest.fn();
    await render(<RunnerUpSheet roomId="r1" titleId={2} onClose={onClose} />, { wrapper });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a skeleton while the card loads, and the error with Retry when it fails', async () => {
    mockApi.roomRunnersUp.mockReturnValue(new Promise(() => {}));
    mockApi.titleCards.mockRejectedValue(new Error('x'));
    await render(<RunnerUpSheet roomId="r1" titleId={2} onClose={jest.fn()} />, { wrapper });
    expect(screen.getByTestId('runner-up-sheet-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Couldn't load the film.")).toBeTruthy(), {
      timeout: 5000,
    });
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

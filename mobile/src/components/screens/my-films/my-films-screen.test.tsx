import '@/i18n';

import type { MyFilmTile } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { api } from '@/api';
import i18n from '@/i18n';

import { MyFilmsScreen } from './my-films-screen';

jest.mock('@/api', () => ({ api: { myFilms: jest.fn() } }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://img.test/t/p' } }),
}));
const mockOnline = { current: true };
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.current }));

const myFilms = api.myFilms as jest.Mock;

const film = (id: number, extra: Partial<MyFilmTile> = {}): MyFilmTile => ({
  title_id: id,
  title: `Film ${id}`,
  year: 1990 + (id % 30),
  poster_path: `/p${id}.jpg`,
  is_picked: false,
  is_super_liked: false,
  at: '2026-11-05T10:00:00Z',
  ...extra,
});
const page = (films: MyFilmTile[], next: string | null = null) => ({
  status: 'ok',
  films,
  next_cursor: next,
});

function show(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
const open = jest.fn();
const showScreen = () => show(<MyFilmsScreen onOpenFilm={open} />);

beforeEach(async () => {
  jest.clearAllMocks();
  mockOnline.current = true;
  await i18n.changeLanguage('en');
});

describe('My films', () => {
  it('reads Liked, All first and shows the accounts line once', async () => {
    myFilms.mockResolvedValue(page([film(1), film(2)]));
    await showScreen();
    await screen.findByRole('button', { name: 'Film 1, 1991' });
    expect(myFilms).toHaveBeenCalledWith(
      expect.objectContaining({ segment: 'liked', filter: 'all', cursor: null, language: 'en' }),
    );
    expect(screen.getAllByText('Saved with this phone for now.')).toHaveLength(1);
  });

  it('switches chips and segments, each with its own query', async () => {
    myFilms.mockImplementation(async ({ segment, filter }: { segment: string; filter: string }) =>
      page([film(segment === 'seen' ? 50 : filter === 'solo' ? 20 : 10)]),
    );
    await showScreen();
    await screen.findByRole('button', { name: /Film 10,/ });
    await fireEvent.press(screen.getByRole('radio', { name: 'Solo' }));
    await screen.findByRole('button', { name: /Film 20,/ });
    expect(myFilms).toHaveBeenLastCalledWith(
      expect.objectContaining({ segment: 'liked', filter: 'solo' }),
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Seen' }));
    await screen.findByRole('button', { name: /Film 50,/ });
    expect(screen.queryByRole('radio', { name: 'Solo' })).toBeNull();
    expect(myFilms).toHaveBeenLastCalledWith(
      expect.objectContaining({ segment: 'seen', filter: 'all' }),
    );
  });

  it('pages: the second page loads at the end, no film twice, the last page stops', async () => {
    myFilms
      .mockResolvedValueOnce(page([film(1), film(2)], 'c1'))
      .mockResolvedValueOnce(page([film(2), film(3)], null));
    await showScreen();
    await screen.findByRole('button', { name: /Film 1,/ });
    const list = screen.getByTestId('films-grid');
    await act(async () => fireEvent(list, 'endReached'));
    await screen.findByRole('button', { name: /Film 3,/ });
    expect(myFilms).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(screen.getAllByRole('button', { name: /Film 2,/ })).toHaveLength(1);
    await act(async () => fireEvent(list, 'endReached'));
    expect(myFilms).toHaveBeenCalledTimes(2);
  });

  it('shows Picked over the star, and reads title, year and badge', async () => {
    myFilms.mockResolvedValue(
      page([
        film(1, { title: 'Heat', year: 1995, is_picked: true, is_super_liked: true }),
        film(2, { title: 'Ran', year: 1985, is_super_liked: true }),
      ]),
    );
    await showScreen();
    await screen.findByRole('button', { name: 'Heat, 1995, picked on a movie night' });
    expect(screen.getByRole('button', { name: 'Ran, 1985, super liked' })).toBeTruthy();
    expect(screen.getAllByText('Picked', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('opens the film sheet for a tile', async () => {
    myFilms.mockResolvedValue(page([film(7, { title: 'Ran', year: 1985 })]));
    await showScreen();
    await fireEvent.press(await screen.findByRole('button', { name: 'Ran, 1985' }));
    expect(open).toHaveBeenCalledWith(7);
  });

  it('shows skeleton tiles while loading', async () => {
    myFilms.mockReturnValue(new Promise(() => {}));
    await showScreen();
    expect(await screen.findByLabelText('Loading your films')).toBeTruthy();
  });

  it.each([
    ['liked', 'all', 'Films you like land here. Play alone or with friends.'],
    ['liked', 'friends', 'Films you like with friends land here.'],
    ['liked', 'solo', 'Films you like on your own land here.'],
    ['seen', 'all', "Films you've seen land here."],
  ])('has an empty line for %s / %s', async (segment, filter, line) => {
    myFilms.mockResolvedValue(page([]));
    await showScreen();
    if (segment === 'seen') await fireEvent.press(screen.getByRole('tab', { name: 'Seen' }));
    else if (filter !== 'all') {
      await fireEvent.press(
        screen.getByRole('radio', { name: filter === 'friends' ? 'With friends' : 'Solo' }),
      );
    }
    expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('offers Play alone on the empty Liked line when it can open', async () => {
    myFilms.mockResolvedValue(page([]));
    const onPlayAlone = jest.fn();
    await show(<MyFilmsScreen onOpenFilm={open} onPlayAlone={onPlayAlone} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Play alone' }));
    expect(onPlayAlone).toHaveBeenCalled();
  });

  it('is offline with nothing read, and says so', async () => {
    mockOnline.current = false;
    myFilms.mockReturnValue(new Promise(() => {}));
    await showScreen();
    expect(await screen.findByText("You're offline")).toBeTruthy();
  });

  it('shows an error with a retry when the first page fails', async () => {
    myFilms
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(page([film(1)]));
    await showScreen();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Try again' }, { timeout: 4000 }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /Film 1,/ })).toBeTruthy());
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    myFilms.mockResolvedValue(page([]));
    await showScreen();
    expect(await screen.findByText('Mes films')).toBeTruthy();
    expect(
      screen.getByText('Enregistré sur ce téléphone pour l’instant.'.replace('’', "'")),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Vus' })).toBeTruthy();
  });
});

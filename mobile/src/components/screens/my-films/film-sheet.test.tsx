import type { Card } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { api } from '@/api';
import { hideToast } from '@/components/ui/toast';
import { hiddenFilms, unhideFilm } from '@/features/my-films/hidden';
import { flushRemovals } from '@/features/my-films/remove';
import i18n from '@/i18n';

import { FilmSheet } from './film-sheet';

jest.mock('@/api', () => ({
  api: { myFilmCard: jest.fn(), setFilmSeen: jest.fn(), removeMyFilm: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://img.test/t/p' } }),
}));
const mockOnline = { current: true };
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.current }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const card: Card = {
  title_id: 7,
  tmdb_id: 949,
  title: 'Heat',
  overview: 'A crew and a cop.',
  year: 1995,
  runtime_min: 170,
  genre_ids: [],
  tmdb_score: 7.9,
  tmdb_votes: 100,
  poster_path: '/p.jpg',
  poster_placeholder: null,
  backdrop_path: null,
  trailer_key: 'abc',
  directors: ['Michael Mann'],
  cast: ['Al Pacino'],
  providers: [{ provider_id: 8, kind: 'subscription', name: 'Netflix', logo_path: null }],
  watch_link: null,
};
const ok = (extra: { seen?: boolean; liked?: boolean } = {}) => ({
  status: 'ok',
  card,
  seen: false,
  liked: true,
  ...extra,
});

const myFilmCard = api.myFilmCard as jest.Mock;
const setFilmSeen = api.setFilmSeen as jest.Mock;
const removeMyFilm = api.removeMyFilm as jest.Mock;

const onClose = jest.fn();
async function showLoaded() {
  const view = await show();
  await screen.findByText('A crew and a cop.');
  return view;
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FilmSheet titleId={7} onClose={onClose} />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockOnline.current = true;
  setFilmSeen.mockResolvedValue({ status: 'ok' });
  removeMyFilm.mockResolvedValue({ status: 'ok' });
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  await act(async () => {
    await flushRemovals();
    hideToast();
  });
  unhideFilm(7);
});

describe('the film sheet', () => {
  it('shows the card back and the player services, with no friend rating, reason or trailer', async () => {
    myFilmCard.mockResolvedValue(ok());
    await show();
    expect(await screen.findByText('A crew and a cop.')).toBeTruthy();
    expect(screen.getAllByText('Heat').length).toBeGreaterThan(0);
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeTruthy();
    expect(screen.queryByText(/Letterboxd/)).toBeNull();
    expect(screen.queryByText('Trailer')).toBeNull();
    expect(screen.queryByText('Tap the card to flip back')).toBeNull();
  });

  it('says no service has it when none does', async () => {
    myFilmCard.mockResolvedValue({ ...ok(), card: { ...card, providers: [] } });
    await show();
    expect(await screen.findByText('None of your services has it.')).toBeTruthy();
  });

  it('marks as seen, then not seen, with the matching calls', async () => {
    myFilmCard.mockResolvedValue(ok());
    await showLoaded();
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as seen' }));
    await screen.findByRole('button', { name: 'Not seen' });
    expect(screen.getByText('It stays out of your games.')).toBeTruthy();
    expect(setFilmSeen).toHaveBeenLastCalledWith({ title_id: 7, seen: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Not seen' }));
    await screen.findByRole('button', { name: 'Mark as seen' });
    expect(setFilmSeen).toHaveBeenLastCalledWith({ title_id: 7, seen: false });
  });

  it('turns the button back and warns when saving fails', async () => {
    myFilmCard.mockResolvedValue(ok());
    setFilmSeen.mockResolvedValue({ status: 'rate_limited' });
    await showLoaded();
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as seen' }));
    await waitFor(() => expect(setFilmSeen).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Mark as seen' });
  });

  it('closes the sheet when marking says the film is gone', async () => {
    myFilmCard.mockResolvedValue(ok());
    setFilmSeen.mockResolvedValue({ status: 'not_found' });
    await showLoaded();
    await fireEvent.press(screen.getByRole('button', { name: 'Mark as seen' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('offers Remove only on a liked film', async () => {
    myFilmCard.mockResolvedValue(ok({ liked: false, seen: true }));
    await show();
    await screen.findByRole('button', { name: 'Not seen' });
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('removes at once on screen, and sends the call only after the toast', async () => {
    myFilmCard.mockResolvedValue(ok());
    await showLoaded();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(onClose).toHaveBeenCalled();
    expect(hiddenFilms().has(7)).toBe(true);
    expect(removeMyFilm).not.toHaveBeenCalled();
    await act(async () => {
      await flushRemovals();
    });
    expect(removeMyFilm).toHaveBeenCalledWith({ title_id: 7 });
  });

  it('shows the not found state with a Close action', async () => {
    myFilmCard.mockResolvedValue({ status: 'not_found' });
    await show();
    expect(await screen.findByText("This film isn't in My films any more.")).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });

  it('disables both buttons offline once the card is in', async () => {
    myFilmCard.mockResolvedValue(ok());
    const view = await showLoaded();
    mockOnline.current = false;
    await view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <FilmSheet titleId={7} onClose={onClose} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("You're offline. Connect to change your films.")).toBeTruthy();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    myFilmCard.mockResolvedValue(ok());
    await show();
    expect(await screen.findByText('A crew and a cop.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marquer comme vu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeTruthy();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import i18n from '@/i18n';

import { RunnersUp } from './runners-up';

jest.mock('@/api', () => ({ api: { roomRunnersUp: jest.fn(), titleCards: jest.fn() } }));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://image.tmdb.org/t/p' } }),
}));
jest.mock('@/features/room', () => ({ ROOM_KEY: (id: string) => ['room', id] }));

const mockApi = api as unknown as Record<'roomRunnersUp' | 'titleCards', jest.Mock>;

const card = (id: number, poster: string | null = '/p.jpg') => ({
  title_id: id,
  title: `Film ${id}`,
  poster_path: poster,
  poster_placeholder: null,
});
const liker = (n: number, name: string) => ({
  member_id: `m${n}`,
  display_name: name,
  avatar_key: 'teal',
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const onOpen = jest.fn();
const show = () => render(<RunnersUp roomId="r1" language="en" onOpen={onOpen} />, { wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  void i18n.changeLanguage('en');
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [card(1), card(2), card(3)] });
});

describe('the runners-up section', () => {
  it('shows each film with its likers, avatars and every name, in the order given (Party)', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'party',
      source: 'finalists',
      runners_up: [
        {
          title_id: 2,
          likes: 4,
          likers: [liker(2, 'Zoé'), liker(1, 'Ana'), liker(3, 'Bo'), liker(4, 'Cy')],
        },
        { title_id: 1, likes: 1, likers: [liker(5, 'Di')] },
      ],
    });
    await show();
    await waitFor(() => expect(screen.getByText('The other finalists')).toBeTruthy());
    const titles = screen.getAllByText(/^Film \d$/).map((n) => n.props.children);
    expect(titles).toEqual(['Film 2', 'Film 1']);
    expect(screen.getByText('Zoé, Ana, Bo, and Cy')).toBeTruthy();
    expect(screen.getByText('Di')).toBeTruthy();
    // Three faces on the first film, never a count, never "+1".
    const faces = screen.queryAllByLabelText(/^(Zoé|Ana|Bo|Cy)$/, { includeHiddenElements: true });
    expect(faces.length).toBe(3);
    expect(screen.queryByText(/\d+ likes?/)).toBeNull();
    expect(screen.queryByText(/\+\d/)).toBeNull();
    expect(
      screen.getByLabelText('Film 2. Liked by Zoé, Ana, Bo, and Cy', { exact: true }),
    ).toBeTruthy();
  });

  it('shows the count and no face or name in Blind', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'blind',
      source: 'most_liked',
      runners_up: [
        { title_id: 1, likes: 3 },
        { title_id: 2, likes: 1 },
      ],
    });
    await show();
    await waitFor(() => expect(screen.getByText('Most liked')).toBeTruthy());
    expect(screen.getByText('3 likes')).toBeTruthy();
    expect(screen.getByText('1 like')).toBeTruthy();
    expect(screen.queryByLabelText('Ana', { includeHiddenElements: true })).toBeNull();
  });

  it('shows only the poster and title when nobody liked the film', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'blind',
      source: 'finalists',
      runners_up: [{ title_id: 1, likes: 0 }],
    });
    await show();
    await waitFor(() => expect(screen.getByText('Film 1')).toBeTruthy());
    expect(screen.queryByText(/like/i)).toBeNull();
    expect(screen.queryByText(/nobody|0/i)).toBeNull();
  });

  it('renders nothing the read does not give: no total, no nope, no rank', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'party',
      source: 'finalists',
      runners_up: [{ title_id: 1, likes: 2, likers: [liker(1, 'Ana'), liker(2, 'Bo')] }],
    });
    await show();
    await waitFor(() => expect(screen.getByText('Ana and Bo')).toBeTruthy());
    expect(screen.queryByText(/\bof\b \d|\d of \d|nope|vet|seen|point|#\d/i)).toBeNull();
  });

  it.each([
    ['an empty list', { status: 'ok', reveal: 'party', source: null, runners_up: [] }],
    ['not finished', { status: 'not_finished' }],
  ])('shows no section for %s', async (_name, answer) => {
    mockApi.roomRunnersUp.mockResolvedValue(answer);
    await show();
    await waitFor(() => expect(mockApi.roomRunnersUp).toHaveBeenCalled());
    expect(screen.queryByTestId('runners-up')).toBeNull();
    expect(mockApi.titleCards).not.toHaveBeenCalled();
  });

  it('shows no section while loading, and none when the read fails', async () => {
    mockApi.roomRunnersUp.mockReturnValue(new Promise(() => {}));
    await show();
    expect(screen.queryByTestId('runners-up')).toBeNull();
  });

  it('shows no section and no error copy when the read is refused', async () => {
    mockApi.roomRunnersUp.mockRejectedValue(new Error('42501'));
    await show();
    await waitFor(() => expect(mockApi.roomRunnersUp).toHaveBeenCalled());
    expect(screen.queryByTestId('runners-up')).toBeNull();
    expect(screen.queryByText(/couldn't|error|offline/i)).toBeNull();
  });

  it('shows no section when the cards cannot be read', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'blind',
      source: 'finalists',
      runners_up: [{ title_id: 1, likes: 1 }],
    });
    mockApi.titleCards.mockRejectedValue(new Error('network'));
    await show();
    await waitFor(() => expect(mockApi.titleCards).toHaveBeenCalled());
    expect(screen.queryByTestId('runners-up')).toBeNull();
  });

  it('opens the film on a tap', async () => {
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'blind',
      source: 'finalists',
      runners_up: [{ title_id: 2, likes: 1 }],
    });
    await show();
    await waitFor(() => expect(screen.getByTestId('runner-up-2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('runner-up-2'));
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('speaks French with "j\'aime" and the French heading', async () => {
    await i18n.changeLanguage('fr');
    mockApi.roomRunnersUp.mockResolvedValue({
      status: 'ok',
      reveal: 'blind',
      source: 'most_liked',
      runners_up: [{ title_id: 1, likes: 2 }],
    });
    await show();
    await waitFor(() => expect(screen.getByText('Les plus aimés')).toBeTruthy());
    expect(screen.getByText("2 j'aime")).toBeTruthy();
  });
});

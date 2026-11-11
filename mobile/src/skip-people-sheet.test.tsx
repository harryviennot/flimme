import '@/i18n';

import { ApiError, type SearchPeopleResult } from '@flimme/contract';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { reportError } from '@/lib/sentry';
import { track } from '@/lib/analytics';
import { tonightDraftStore } from '@/features/lobby/tonight-draft';
import i18n from '@/i18n';

import SkipPeopleScreen from '@/app/room/[id]/skip-people';

const mockOnline = { current: true };
const mockSeat = { current: { people: [] as { id: number; name: string }[] } };
const mockBack = jest.fn();
const mockSearch = jest.fn<Promise<SearchPeopleResult>, [{ query: string; language?: string }]>();

jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: 'room-1' }),
}));
jest.mock('@/api', () => ({
  api: { searchPeople: (args: { query: string; language?: string }) => mockSearch(args) },
}));
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.current }));
jest.mock('@/features/room', () => ({
  useRoomGenres: () => ({
    data: {
      status: 'ok',
      options: [],
      mine: [],
      out: [],
      skips: { genre_ids: [], people: mockSeat.current.people },
    },
  }),
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), screen: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('@/lib/sound', () => ({ playSound: jest.fn(), preloadSounds: jest.fn() }));

const penelope = {
  id: 955,
  name: 'Pénélope Cruz',
  known_for: { title: 'Volver', year: 2006 },
};
const pitt = { id: 287, name: 'Brad Pitt', known_for: { title: 'Fight Club', year: 1999 } };
const noYear = { id: 5, name: 'Sans Année', known_for: { title: 'Sans Date', year: null } };

const frame = { x: 0, y: 0, width: 375, height: 667 };
function Sheet() {
  return (
    <SafeAreaProvider initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <SkipPeopleScreen />
    </SafeAreaProvider>
  );
}

const type = async (text: string) => {
  await fireEvent.changeText(screen.getByLabelText('Search for a name'), text);
};

describe('the people search sheet', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });
  beforeEach(() => {
    mockOnline.current = true;
    mockSeat.current = { people: [] };
    mockBack.mockClear();
    mockSearch.mockReset();
    (reportError as jest.Mock).mockClear();
    (track as jest.Mock).mockClear();
    tonightDraftStore.getState().reset();
  });

  it('opens with the helper, the focused field and no results area', async () => {
    await render(<Sheet />);
    expect(screen.getByText('Skip someone')).toBeTruthy();
    expect(screen.getByText(/Nobody else sees who you skip/)).toBeTruthy();
    expect(screen.getByLabelText('Search for a name')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /leave tonight/ })).toBeNull();
  });

  it('makes no call under 2 characters', async () => {
    await render(<Sheet />);
    await type('p');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('finds a name typed without accents, in the profile language, and shows the film', async () => {
    mockSearch.mockResolvedValue({ status: 'ok', people: [penelope] });
    await render(<Sheet />);
    await type('penelope');
    expect(
      await screen.findByRole('button', { name: 'Pénélope Cruz, Volver (2006)' }),
    ).toBeTruthy();
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith({ query: 'penelope', language: 'en' });
    expect(screen.getByText('Volver (2006)')).toBeTruthy();
    // No photo anywhere.
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/"type":"Image"|RCTImageView/);
  });

  it('shows the title alone without a year, and no film line without a film', async () => {
    mockSearch.mockResolvedValue({
      status: 'ok',
      people: [noYear, { id: 6, name: 'Sans Film', known_for: null } as never],
    });
    await render(<Sheet />);
    await type('sans');
    expect(await screen.findByRole('button', { name: 'Sans Année, Sans Date' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sans Film' })).toBeTruthy();
    expect(screen.getByText('Sans Date')).toBeTruthy();
  });

  it('draws three skeleton rows the first time, with the field busy', async () => {
    mockSearch.mockReturnValue(new Promise(() => undefined));
    await render(<Sheet />);
    await type('pitt');
    expect(screen.getByTestId('search-busy')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Brad/ })).toBeNull();
  });

  it('a tap on a result adds it to the draft, in order, and closes', async () => {
    tonightDraftStore.getState().set('room-1', { people: [{ id: 1, name: 'First' }] });
    mockSearch.mockResolvedValue({ status: 'ok', people: [pitt] });
    await render(<Sheet />);
    await type('pitt');
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Brad Pitt, Fight Club (1999)' }),
    );
    expect(tonightDraftStore.getState().people).toEqual([
      { id: 1, name: 'First' },
      { id: 287, name: 'Brad Pitt' },
    ]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a tap on someone already listed closes with no change, and the row says so', async () => {
    mockSeat.current = { people: [{ id: 287, name: 'Brad Pitt' }] };
    mockSearch.mockResolvedValue({ status: 'ok', people: [pitt] });
    await render(<Sheet />);
    await type('pitt');
    const row = await screen.findByRole('button', {
      name: 'Brad Pitt, Fight Club (1999), Already on your list',
    });
    expect(row).toBeSelected();
    await fireEvent.press(row);
    expect(tonightDraftStore.getState().people).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('at the cap of 3 the helper becomes the cap note, and a new person adds nothing and stays', async () => {
    mockSeat.current = {
      people: [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ],
    };
    mockSearch.mockResolvedValue({ status: 'ok', people: [pitt] });
    await render(<Sheet />);
    expect(screen.getByText('3 people at most. Remove one to swap.')).toBeTruthy();
    await type('pitt');
    await fireEvent.press(await screen.findByRole('button', { name: /Brad Pitt/ }));
    expect(tonightDraftStore.getState().people).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('nobody by that name: the empty state with its hint', async () => {
    mockSearch.mockResolvedValue({ status: 'ok', people: [] });
    await render(<Sheet />);
    await type('zzzz');
    expect(await screen.findByText('Nobody by that name in our films.')).toBeTruthy();
    expect(screen.getByText('Check the spelling or try another name.')).toBeTruthy();
  });

  it('a failed call: the failed state, and Try again searches again', async () => {
    mockSearch.mockRejectedValueOnce(new Error('boom'));
    mockSearch.mockResolvedValueOnce({ status: 'ok', people: [pitt] });
    await render(<Sheet />);
    await type('pitt');
    expect(await screen.findByText("The search didn't work.")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Brad Pitt/ })).toBeTruthy();
  });

  it('invalid is a failure and is reported without the text', async () => {
    mockSearch.mockResolvedValue({ status: 'invalid' });
    await render(<Sheet />);
    await type('secretname');
    expect(await screen.findByText("The search didn't work.")).toBeTruthy();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(String((reportError as jest.Mock).mock.calls[0][0])).not.toContain('secretname');
  });

  it('rate_limited shows as a failure', async () => {
    mockSearch.mockResolvedValue({ status: 'rate_limited' });
    await render(<Sheet />);
    await type('pitt');
    expect(await screen.findByText("The search didn't work.")).toBeTruthy();
  });

  it('offline: says so, and searches the current text by itself once back', async () => {
    mockOnline.current = false;
    mockSearch.mockResolvedValue({ status: 'ok', people: [pitt] });
    const { rerender } = await render(<Sheet />);
    await type('pitt');
    expect(
      await screen.findByText('No network. Search comes back with your connection.'),
    ).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
    mockOnline.current = true;
    await rerender(<Sheet />);
    expect(await screen.findByRole('button', { name: /Brad Pitt/ })).toBeTruthy();
    expect(mockSearch).toHaveBeenCalledWith({ query: 'pitt', language: 'en' });
  });

  it('a network error from the call is the offline state', async () => {
    mockSearch.mockRejectedValue(new ApiError('network', 'search_people', 'the request failed'));
    await render(<Sheet />);
    await type('pitt');
    expect(
      await screen.findByText('No network. Search comes back with your connection.'),
    ).toBeTruthy();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    mockSearch.mockResolvedValue({ status: 'ok', people: [penelope] });
    await render(<Sheet />);
    expect(screen.getByText("Écarter quelqu'un")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Chercher un nom'), 'penelope');
    expect(
      await screen.findByRole('button', { name: 'Pénélope Cruz, Volver (2006)' }),
    ).toBeTruthy();
    expect(mockSearch).toHaveBeenCalledWith({ query: 'penelope', language: 'fr' });
    await i18n.changeLanguage('en');
  });

  it('never lets the typed text reach analytics, a report or the console', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSearch.mockResolvedValueOnce({ status: 'ok', people: [pitt] });
    mockSearch.mockResolvedValueOnce({ status: 'invalid' });
    await render(<Sheet />);
    await type('secretname');
    await screen.findByRole('button', { name: /Brad Pitt/ });
    await type('secretname two');
    await screen.findByText("The search didn't work.");
    const seen = JSON.stringify([
      (track as jest.Mock).mock.calls,
      (reportError as jest.Mock).mock.calls.map((call) => String(call[0])),
      log.mock.calls,
      warn.mock.calls,
      error.mock.calls,
    ]);
    expect(seen).not.toContain('secretname');
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});

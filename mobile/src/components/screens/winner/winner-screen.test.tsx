import '@/i18n';

import type { Card } from '@flimme/contract';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import type { WinnerView } from '@/features/winner/use-winner';
import { serviceLogos } from '@/features/winner/services';

import { track } from '@/lib/analytics';

import { WinnerScreen } from './winner-screen';

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
// The runners-up have their own tests (runners-up.test.tsx); here the section only has to mount.
let mockRunnersUp: unknown = null;
jest.mock('@/features/winner/use-runners-up', () => ({
  useRunnersUp: () => ({ data: mockRunnersUp, ids: [], answered: false }),
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: undefined }),
}));

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/marquee-bulbs', () => ({ MarqueeBulbs: () => null }));

type Offer = Card['providers'][number];
const offer = (provider_id: number, name: string, kind: Offer['kind']): Offer => ({
  provider_id,
  name,
  kind,
  logo_path: '/x.jpg',
});

const card = { title: 'Past Lives', year: 2023, runtime_min: 105, poster_path: '/p.jpg' } as Card;

function ready(over: Partial<Extract<WinnerView, { status: 'ready' }>> = {}): WinnerView {
  return {
    status: 'ready',
    card,
    posterUri: 'https://image.tmdb.org/t/p/w500/p.jpg',
    services: serviceLogos(
      [
        offer(8, 'Netflix', 'subscription'),
        offer(8, 'Netflix', 'ads'),
        offer(381, 'Canal+', 'free'),
      ],
      'https://image.tmdb.org/t/p',
    ),
    watchLink: 'https://www.themoviedb.org/movie/1/watch?locale=FR',
    onlyFilm: false,
    outcome: 'match',
    ...over,
  };
}

const show = (view: WinnerView, props: { online?: boolean; onHome?: () => void } = {}) =>
  render(
    <WinnerScreen
      view={view}
      language="en"
      online={props.online ?? true}
      onHome={props.onHome ?? jest.fn()}
    />,
  );

beforeEach(() => jest.clearAllMocks());

describe('the winner screen', () => {
  it('shows the poster, the title and the meta', async () => {
    await show(ready());
    expect(screen.getByText('Past Lives')).toBeTruthy();
    expect(screen.getByText('2023 · 1 h 45')).toBeTruthy();
    expect(screen.getByLabelText('Poster for Past Lives')).toBeTruthy();
    expect(screen.getByLabelText('Tonight’s pick: Past Lives'.replace('’', "'"))).toBeTruthy();
  });

  it('shows one tile per service, each once, and the JustWatch credit', async () => {
    await show(ready());
    expect(screen.getAllByTestId('service-tile')).toHaveLength(2);
    expect(screen.getAllByText('Netflix')).toHaveLength(1);
    expect(screen.getByText('Canal+')).toBeTruthy();
    expect(screen.getByLabelText('Available on Netflix and Canal+')).toBeTruthy();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeTruthy();
  });

  it('says no service has it any more, and keeps the credit and More details', async () => {
    await show(ready({ services: [] }));
    expect(screen.getByText('None of your services has it any more.')).toBeTruthy();
    expect(screen.queryAllByTestId('service-tile')).toHaveLength(0);
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeTruthy();
    expect(screen.getByText('More details')).toBeTruthy();
  });

  it('opens the watch link in the in-app browser from More details', async () => {
    await show(ready());
    fireEvent.press(screen.getByRole('button', { name: 'More details on TMDB' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://www.themoviedb.org/movie/1/watch?locale=FR',
    );
  });

  it('has no More details without a watch link', async () => {
    await show(ready({ watchLink: null }));
    expect(screen.queryByText('More details')).toBeNull();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeTruthy();
  });

  it('says why a single-film pick was made', async () => {
    await show(ready({ onlyFilm: true }));
    expect(screen.getByText('The only film anyone liked')).toBeTruthy();
  });

  it('does not say it for a pick the room voted for', async () => {
    await show(ready());
    expect(screen.queryByText('The only film anyone liked')).toBeNull();
  });

  it('shows no seat name, avatar or count', async () => {
    await show(ready());
    expect(screen.queryByTestId('avatar')).toBeNull();
    expect(screen.queryByText(/liked|of \d/i)).toBeNull();
  });

  it('keeps the poster frame and shows a skeleton while loading', async () => {
    await show({ status: 'loading' });
    expect(screen.getByTestId('winner-poster')).toBeTruthy();
    expect(screen.getByTestId('winner-loading')).toBeTruthy();
    expect(screen.queryByText('Where to watch')).toBeNull();
    expect(screen.getByText('Home')).toBeTruthy();
  });

  it('shows an inline retry when the read failed, with Home still there', async () => {
    const retry = jest.fn();
    await show({ status: 'error', retry });
    expect(screen.getByText("Couldn't load the film.")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText('Home')).toBeTruthy();
  });

  it('says it is offline before the card came', async () => {
    await show({ status: 'loading' }, { online: false });
    expect(screen.getByText("You're offline. The film shows when you're back.")).toBeTruthy();
  });

  it('renders no poster and no film for a room with no pick, with Home kept', async () => {
    const onHome = jest.fn();
    await show({ status: 'no_pick' }, { onHome });
    expect(screen.queryByTestId('winner-poster')).toBeNull();
    expect(screen.getByText('Nothing fits tonight')).toBeTruthy();
    expect(screen.getByText(/No film got a like tonight/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onHome).toHaveBeenCalled();
  });
});

describe('Share recap (winner.md#share-recap)', () => {
  const showWith = (view: WinnerView, props: { solo?: boolean; onShareRecap?: () => void }) =>
    render(
      <WinnerScreen
        view={view}
        language="en"
        online
        onHome={jest.fn()}
        solo={props.solo}
        onShareRecap={props.onShareRecap}
      />,
    );

  it('opens the recap from a group pick', async () => {
    const open = jest.fn();
    await showWith(ready(), { onShareRecap: open });
    fireEvent.press(screen.getByRole('button', { name: "Share an image of tonight's pick" }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a solo pick', ready(), true],
    ['a room with no pick', { status: 'no_pick' } as WinnerView, false],
    ['a card still loading', { status: 'loading' } as WinnerView, false],
    ['a card that failed', { status: 'error', retry: jest.fn() } as WinnerView, false],
  ])('has no Share recap on %s', async (_name, view, solo) => {
    await showWith(view, { solo, onShareRecap: jest.fn() });
    expect(screen.queryByText('Share recap')).toBeNull();
  });
});

describe('the runners-up (winner.md#the-runners-up)', () => {
  const party = {
    source: 'finalists',
    items: [
      {
        card: { title_id: 9, title: 'Aftersun', poster_path: null, poster_placeholder: null },
        likers: [{ memberId: 'm1', name: 'Ana', color: 'teal' }],
        likes: null,
      },
    ],
  };
  const showRoom = (view: WinnerView, solo = false) =>
    render(
      <WinnerScreen
        view={view}
        language="en"
        online
        onHome={jest.fn()}
        solo={solo}
        roomId="r1"
        onOpenRunnerUp={jest.fn()}
      />,
    );
  afterEach(() => {
    mockRunnersUp = null;
  });

  it('keeps the pick free of names and faces, and puts them under the section', async () => {
    mockRunnersUp = party;
    await showRoom(ready());
    expect(screen.getByTestId('runners-up')).toBeTruthy();
    // The only name on the screen is inside the section.
    const names = screen.queryAllByText('Ana');
    expect(names).toHaveLength(1);
    expect(screen.getByTestId('runner-up-9')).toHaveTextContent(/Ana/);
    expect(screen.getByTestId('winner-poster')).not.toHaveTextContent(/Ana/);
  });

  it('shows nothing while the read has nothing, and the pick is unaffected', async () => {
    await showRoom(ready());
    expect(screen.queryByTestId('runners-up')).toBeNull();
    expect(screen.getByText('Past Lives')).toBeTruthy();
  });

  it.each([
    ['a solo pick', ready(), true],
    ['a room with no pick', { status: 'no_pick' } as WinnerView, false],
    ['a card still loading', { status: 'loading' } as WinnerView, false],
  ])('has no section on %s', async (_name, view, solo) => {
    mockRunnersUp = party;
    await showRoom(view, solo);
    expect(screen.queryByTestId('runners-up')).toBeNull();
  });
});

describe('the watch page event', () => {
  it('counts a group winner and not a solo pick', async () => {
    const group = await render(
      <WinnerScreen view={ready()} language="en" online onHome={jest.fn()} />,
    );
    fireEvent.press(screen.getByRole('button', { name: /details/i }));
    expect(track).toHaveBeenCalledWith('winner:watch_page_open');
    group.unmount();
    jest.mocked(track).mockClear();
    await render(<WinnerScreen view={ready()} language="en" online solo onHome={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: /details/i }));
    expect(track).not.toHaveBeenCalled();
  });
});

import i18n from '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { MatchOverlay, type MatchOverlayProps } from './match-overlay';

const mockReduced = { value: false };
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, key) => (key === 'useReducedMotion' ? () => mockReduced.value : target[key]),
  });
});
const mockBulbs = jest.fn();
jest.mock('@/components/ui/marquee-bulbs', () => ({
  MarqueeBulbs: (props: unknown) => {
    mockBulbs(props);
    return null;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const players = [
  { id: 'a', name: 'Léa', color: 'teal' as const },
  { id: 'b', name: 'Sam', color: 'blue' as const },
  { id: 'c', name: 'Jo', color: 'gold' as const },
];

async function setup(props: Partial<MatchOverlayProps> = {}) {
  const onContinue = jest.fn();
  const view = await render(
    <MatchOverlay
      film={{ title: 'Neon Harbor', meta: '2021 · 1 h 52' }}
      poster={null}
      count={{ likes: 3, of: 3 }}
      players={players}
      language="en"
      onContinue={onContinue}
      {...props}
    />,
  );
  return { onContinue, ...view };
}

beforeEach(() => {
  mockReduced.value = false;
  mockBulbs.mockClear();
});

describe('the match overlay', () => {
  it('shows the title, the film and the unanimous count', async () => {
    await setup();
    expect(screen.getByText("It's a match!")).toBeTruthy();
    expect(screen.getByText('Neon Harbor')).toBeTruthy();
    expect(screen.getByText('2021 · 1 h 52')).toBeTruthy();
    expect(screen.getByText('Unanimous: 3 of 3')).toBeTruthy();
  });

  it('reads a majority as "7 of 9 said yes"', async () => {
    await setup({ count: { likes: 7, of: 9 } });
    expect(screen.getByText('7 of 9 said yes')).toBeTruthy();
  });

  it('shows every seated player once, with no marks and no online dots', async () => {
    await setup();
    for (const player of players) expect(screen.getAllByLabelText(player.name)).toHaveLength(1);
    expect(screen.getByLabelText(/^Everyone in the room: Léa, Sam,? and Jo$/)).toBeTruthy();
  });

  it('shows no count until one has come', async () => {
    await setup({ count: null });
    expect(screen.queryByText(/of 3/)).toBeNull();
  });

  it('shows the placeholder state with no film yet', async () => {
    await setup({ film: null });
    expect(screen.getByText("It's a match!")).toBeTruthy();
    expect(screen.queryByText('Neon Harbor')).toBeNull();
  });

  it('goes on with the button or a tap anywhere', async () => {
    const { onContinue } = await setup();
    await fireEvent.press(screen.getByText('Where to watch'));
    await fireEvent.press(screen.getByTestId('match-tap', { includeHiddenElements: true }));
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  it('announces the match for a screen reader', async () => {
    await setup();
    expect(screen.getByLabelText("It's a match: Neon Harbor. Unanimous: 3 of 3")).toBeTruthy();
  });

  it('chases the bulbs, and holds them still with Reduce Motion', async () => {
    await setup();
    expect(mockBulbs).toHaveBeenLastCalledWith(expect.objectContaining({ chasing: true }));
    mockBulbs.mockClear();
    mockReduced.value = true;
    await setup();
    expect(mockBulbs).toHaveBeenLastCalledWith(expect.objectContaining({ chasing: false }));
  });

  it('is in French too', async () => {
    await i18n.changeLanguage('fr');
    try {
      await setup({ count: { likes: 2, of: 3 } });
      expect(screen.getByText("C'est un match !")).toBeTruthy();
      expect(screen.getByText('2 sur 3 ont dit oui')).toBeTruthy();
      expect(screen.getByText('Où regarder')).toBeTruthy();
    } finally {
      await act(async () => i18n.changeLanguage('en'));
    }
  });
});

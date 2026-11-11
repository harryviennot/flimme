import { render } from '@testing-library/react-native';

import i18n from '@/i18n';
import { Pressable, SCROLL_PRESS_DELAY_MS } from '@/components/ui/pressable';

import { GenreChips } from './genre-chips';
import { ServiceTile } from './service-tile';

jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));
// Spy on the props our Pressable receives: the delay itself is React Native's Pressability.
jest.mock('@/components/ui/pressable', () => {
  const actual = jest.requireActual('@/components/ui/pressable');
  return {
    ...actual,
    Pressable: jest.fn((props: object) => actual.Pressable(props)),
  };
});

const received = () =>
  jest.mocked(Pressable).mock.calls.map(([props]) => props.unstable_pressDelay);

beforeEach(() => jest.mocked(Pressable).mockClear());

// A tile or chip in a list that scrolls waits 130 ms before the press starts (sounds.md), so a
// scroll that begins on it never ticks. React Native's Pressability does the waiting.
describe('press delay in scrolling lists', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('is 130 ms', () => {
    expect(SCROLL_PRESS_DELAY_MS).toBe(130);
  });

  it('is on the service tile', async () => {
    await render(<ServiceTile name="Netflix" />);
    expect(received()).toEqual([SCROLL_PRESS_DELAY_MS]);
  });

  it('is on every genre chip', async () => {
    await render(
      <GenreChips
        options={[
          { id: 1, name: 'Action', count: 0 },
          { id: 2, name: 'Comedy', count: 0 },
        ]}
        selected={[]}
        onToggle={() => undefined}
        showCounts={false}
      />,
    );
    expect(received()).toEqual([SCROLL_PRESS_DELAY_MS, SCROLL_PRESS_DELAY_MS]);
  });
});

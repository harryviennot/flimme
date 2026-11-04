import i18n from '@/i18n';

import type { NextCard } from '@flimme/contract';
import { act, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';

import { SwipeCard, type SwipeCardProps } from './swipe-card';

// How a thrown card moves: a flight across the screen with its tilt, or with Reduce Motion a
// short slide and a fade with no tilt. The animations finish at once in test mode.

let mockReduced = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: () => mockReduced,
  };
});
jest.mock('@/lib/haptics', () => ({ haptics: { commit: jest.fn(), throw: jest.fn() } }));

const card: NextCard = {
  title_id: 7,
  tmdb_id: 7,
  title: 'Film 7',
  overview: null,
  year: 2020,
  runtime_min: 100,
  genre_ids: [],
  tmdb_score: 7,
  tmdb_votes: 10,
  poster_path: null,
  poster_placeholder: null,
  backdrop_path: null,
  trailer_key: null,
  directors: [],
  cast: [],
  providers: [],
  watch_link: null,
  deck_source: 'opening',
  reason_code: null,
  reason_params: {},
  member_ratings: [],
};

const SCREEN = { width: 400, height: 800 };

function Card(props: Partial<SwipeCardProps>) {
  const dragProgress = useSharedValue(0);
  const lit = useSharedValue(0);
  const dragging = useSharedValue(0);
  return (
    <GestureHandlerRootView>
      <SwipeCard
        card={card}
        depth={0}
        flipped={false}
        size={{ width: 345, height: 518 }}
        screen={SCREEN}
        text={{ language: 'en', imageBase: undefined, screenWidth: 400, noSynopsis: '' }}
        dragProgress={dragProgress}
        lit={lit}
        dragging={dragging}
        locked={false}
        a11y={{ label: 'Film 7', actions: [], onAction: () => undefined }}
        onRelease={() => undefined}
        onFlip={() => undefined}
        onLanded={() => undefined}
        {...props}
      />
    </GestureHandlerRootView>
  );
}

const style = () =>
  getAnimatedStyle(screen.getByTestId('swipe-card-7', { includeHiddenElements: true })) as {
    opacity: number;
    transform: Record<string, unknown>[];
  };
const part = (key: string) => style().transform.find((t) => key in t)?.[key];

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  mockReduced = false;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

/** Lets the card's animations run to their end. */
const settle = () =>
  act(async () => {
    jest.advanceTimersByTime(1000);
  });

describe('a thrown card', () => {
  it('flies off the side of the screen, tilted, when a button throws it right', async () => {
    const landed = jest.fn();
    await render(
      <Card
        flight={{ kind: 'like', fromGesture: false, flipped: false }}
        depth={0}
        onLanded={landed}
      />,
    );
    await settle();
    expect(part('translateX')).toBeGreaterThan(SCREEN.width);
    expect(part('rotate')).toBe('15deg'); // the tilt is capped at the token's maximum
    expect(landed).toHaveBeenCalledWith(7);
  });

  it('flies left for a nope and up for a seen', async () => {
    await render(<Card flight={{ kind: 'nope', fromGesture: false, flipped: false }} />);
    await settle();
    expect(part('translateX') as number).toBeLessThan(-SCREEN.width);
    expect(part('rotate')).toBe('-15deg');
    await screen.unmount();
    await render(<Card flight={{ kind: 'seen', fromGesture: false, flipped: false }} />);
    await settle();
    expect(part('translateY') as number).toBeLessThan(-SCREEN.height);
  });

  it('keeps its own flight when a finger threw it: nothing starts a second one', async () => {
    const landed = jest.fn();
    await render(
      <Card flight={{ kind: 'like', fromGesture: true, flipped: false }} onLanded={landed} />,
    );
    expect(part('translateX')).toBe(0);
    expect(landed).not.toHaveBeenCalled();
  });
});

describe('with Reduce Motion', () => {
  beforeEach(() => {
    mockReduced = true;
  });

  it('slides a short way and fades out instead of flying, with no tilt', async () => {
    const landed = jest.fn();
    await render(
      <Card flight={{ kind: 'like', fromGesture: false, flipped: false }} onLanded={landed} />,
    );
    await settle();
    const x = part('translateX') as number;
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(SCREEN.width / 2);
    expect(part('rotate')).toBe('0deg');
    expect(style().opacity).toBe(0);
    expect(landed).toHaveBeenCalledWith(7);
  });
});

describe('the cards behind', () => {
  it('sit lower, smaller and fainter, and take no touch', async () => {
    await render(<Card depth={2} />);
    expect(style().opacity).toBeLessThan(1);
    expect(part('scale')).toBeLessThan(1);
    expect(screen.queryByLabelText('Film 7')).toBeNull();
  });

  it('the top one is a single labelled element', async () => {
    await render(<Card depth={0} />);
    expect(screen.getByLabelText('Film 7').props.accessible).toBe(true);
  });
});

it('gives no haptic on its own: the haptics belong to the release and the buttons', async () => {
  await render(<Card flight={{ kind: 'like', fromGesture: false, flipped: false }} />);
  expect(haptics.commit).not.toHaveBeenCalled();
});

import i18n from '@/i18n';

import type { NextCard } from '@flimme/contract';
import { act, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { markTrailerTouch } from '@/features/swipe/trailer';
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

// Reanimated's test helper reads the style the UI thread would have applied.
const animatedStyle = getAnimatedStyle as unknown as (element: unknown) => {
  opacity: number;
  transform: Record<string, unknown>[];
};
const style = () =>
  animatedStyle(screen.getByTestId('swipe-card-7', { includeHiddenElements: true }));
const part = (key: string) => style().transform.find((t) => key in t)?.[key];

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  jest.clearAllMocks();
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

describe('the finger', () => {
  /** A drag of `dx`, `dy` points, released at `velocity` points per second. */
  const drag = (
    dx: number,
    dy: number,
    velocity: { x: number; y: number } = { x: 0, y: 0 },
    end: State = State.END,
  ) =>
    fireGestureHandler(getByGestureTestId('swipe-pan-7'), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: dx / 2, translationY: dy / 2 },
      {
        state: State.ACTIVE,
        translationX: dx,
        translationY: dy,
        velocityX: velocity.x,
        velocityY: velocity.y,
      },
      {
        state: end,
        translationX: dx,
        translationY: dy,
        velocityX: velocity.x,
        velocityY: velocity.y,
      },
    ]);

  it.each([
    ['right', 160, 0, 'right'],
    ['left', -160, 0, 'left'],
    ['up', 10, -200, 'up'],
  ] as const)('released past the line to the %s answers %s', async (_name, dx, dy, direction) => {
    const onRelease = jest.fn();
    await render(<Card onRelease={onRelease} />);
    await act(async () => drag(dx, dy));
    await settle();
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledWith(7, direction);
  });

  it('released before the line, slowly, answers nothing and the card goes back', async () => {
    const onRelease = jest.fn();
    await render(<Card onRelease={onRelease} />);
    await act(async () => drag(90, 0));
    await settle();
    expect(onRelease).not.toHaveBeenCalled();
    expect(part('translateX') as number).toBeCloseTo(0, 0);
  });

  it('thrown early by a flick faster than the throw speed', async () => {
    const onRelease = jest.fn();
    await render(<Card onRelease={onRelease} />);
    await act(async () => drag(40, 0, { x: 1500, y: 0 }));
    await settle();
    expect(onRelease).toHaveBeenCalledWith(7, 'right');
  });

  it('ticks once when the drag crosses the commit line', async () => {
    await render(<Card />);
    await act(async () => drag(160, 0));
    await settle();
    expect(haptics.commit).toHaveBeenCalledTimes(1);
  });

  it('a drag the system cancels is no release: nothing is answered and the card goes back', async () => {
    const onRelease = jest.fn();
    await render(<Card onRelease={onRelease} />);
    await act(async () => drag(200, 0, { x: 2000, y: 0 }, State.CANCELLED));
    await settle();
    expect(onRelease).not.toHaveBeenCalled();
    expect(part('translateX') as number).toBeCloseTo(0, 0);
  });

  it('takes no touch once the room has moved on', async () => {
    const onRelease = jest.fn();
    await render(<Card onRelease={onRelease} locked />);
    await act(async () => drag(200, 0));
    await settle();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('takes no touch when the card is not on top', async () => {
    const onRelease = jest.fn();
    await render(<Card depth={1} onRelease={onRelease} />);
    await act(async () => drag(200, 0));
    await settle();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('flips on a tap', async () => {
    const onFlip = jest.fn();
    await render(<Card onFlip={onFlip} />);
    await act(async () =>
      fireGestureHandler(getByGestureTestId('swipe-tap-7'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]),
    );
    await settle();
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('does not flip on a tap that started on the Trailer button', async () => {
    const onFlip = jest.fn();
    await render(<Card onFlip={onFlip} />);
    markTrailerTouch();
    await act(async () =>
      fireGestureHandler(getByGestureTestId('swipe-tap-7'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]),
    );
    await settle();
    expect(onFlip).not.toHaveBeenCalled();
  });
});

describe('with Reduce Motion, the card behind', () => {
  it('is already full size, while without it it waits smaller', async () => {
    await render(<Card depth={1} />);
    await settle();
    expect(part('scale')).toBeLessThan(1);
    await screen.unmount();
    mockReduced = true;
    await render(<Card depth={1} />);
    await settle();
    expect(part('scale')).toBe(1);
  });
});

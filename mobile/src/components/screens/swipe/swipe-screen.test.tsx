import i18n from '@/i18n';

import type { NextCard, RoomSeat } from '@flimme/contract';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStore } from 'zustand/vanilla';

import { clearNearMisses } from '@/features/swipe/near-miss';
import { createAnswerer, type Answerer } from '@/features/swipe/answer';
import { createCardStack, type CardStack } from '@/features/swipe/card-stack';
import type { QueuedVote } from '@/features/swipe/vote-queue';

import { SwipeScreen } from './swipe-screen';

// The swipe screen over a real card stack and a real answer path, with the vote queue and the
// room's channels faked. The drag itself is a gesture on the UI thread and is covered by
// feel.test.ts (the rules) and the Maestro run (the finger).

const mockSwipe: { current: ReturnType<typeof makeSwipe> | null } = { current: null };
jest.mock('@/features/swipe/use-swipe', () => ({ useSwipe: () => mockSwipe.current }));
jest.mock('@/lib/haptics', () => ({
  haptics: { throw: jest.fn(), press: jest.fn(), commit: jest.fn() },
}));
const mockBanner = jest.fn();
jest.mock('@/components/screens/room/room-banner', () => ({
  RoomBanner: (props: { roomId: string; waitingVotes: number }) => {
    mockBanner(props);
    return null;
  },
}));

// The top bar has its own test (top-bar.test.tsx).
jest.mock('./top-bar', () => ({ SwipeTopBar: () => null }));
jest.mock('@/features/swipe/index', () => ({ voteQueue: { has: () => false } }));
const mockRoomEvents = new Map<string, (payload: unknown) => void>();
const mockRoom: { data: { reveal: string } } = { data: { reveal: 'party' } };
jest.mock('@/features/room', () => ({
  useRoom: () => mockRoom,
  useRoomEvent: (_room: string, event: string, handler: (payload: unknown) => void) => {
    mockRoomEvents.set(event, handler);
  },
}));

const ROOM = 'room-1';

function film(id: number): NextCard {
  return {
    title_id: id,
    tmdb_id: id,
    title: `Film ${id}`,
    overview: 'A story.',
    year: 2020,
    runtime_min: 100,
    genre_ids: [],
    tmdb_score: 7,
    tmdb_votes: 10,
    poster_path: null,
    poster_placeholder: null,
    backdrop_path: null,
    trailer_key: id === 1 ? 'abc123' : null,
    directors: id === 1 ? ['Paul King'] : [],
    cast: id === 1 ? ['Ben Whishaw', 'Hugh Grant'] : [],
    providers: [],
    watch_link: null,
    deck_source: 'opening',
    reason_code: null,
    reason_params: {},
    member_ratings: [],
  };
}

const seat = { member_id: 'm1', super_likes_left: 2, swipe_count: 0 } as RoomSeat;
const stacks: CardStack[] = [];

async function makeSwipe(
  options: {
    cards?: number;
    locked?: boolean;
    superLikes?: number;
    seenRule?: 'hide_seen' | 'allow_rewatch' | 'show_all';
  } = {},
) {
  const votes: QueuedVote[] = [];
  const cards = Array.from({ length: options.cards ?? 20 }, (_, i) => film(i + 1));
  const stack = createCardStack(
    {
      fetchCards: async () => cards.filter((c) => !votes.some((v) => v.title_id === c.title_id)),
      requestCards: async () => 'ok',
      prefetch: () => undefined,
      isAnswered: (id) => votes.some((v) => v.title_id === id),
      now: () => Date.now(),
    },
    { screenWidth: 393 },
  );
  stacks.push(stack);
  stack.getState().start();
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
  const counts: number[] = [];
  const answerer: Answerer = createAnswerer({
    stack,
    queue: {
      enqueue: (vote) => void votes.push(vote),
      pendingSuperLikes: () => votes.filter((v) => v.answer === 'super_like').length,
    },
    roomId: ROOM,
    memberId: seat.member_id,
    initialSuperLikes: options.superLikes ?? 2,
    initialCount: 0,
    locked: () => false,
    now: () => Date.now(),
    onCount: (n) => void counts.push(n),
  });
  const state = createStore(() => ({ superLikesLeft: answerer.superLikesLeft() }));
  return {
    stack,
    votes,
    counts,
    state,
    swipe: {
      stack,
      answer: (kind: Parameters<Answerer['answer']>[0]) => {
        const done = answerer.answer(kind);
        state.setState({ superLikesLeft: answerer.superLikesLeft() });
        return done;
      },
      get superLikesLeft() {
        return state.getState().superLikesLeft;
      },
      waitingVotes: 0,
      locked: options.locked ?? false,
      seenRule: options.seenRule ?? 'hide_seen',
      online: true,
      imageBase: undefined,
    },
  };
}

// `makeSwipe` resolves to a pair; the mock hook only needs `swipe`.
async function setup(options: Parameters<typeof makeSwipe>[0] = {}) {
  const made = await makeSwipe(options);
  mockSwipe.current = made.swipe as never;
  const tree = () => (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <SwipeScreen roomId={ROOM} seat={{ ...seat, super_likes_left: options.superLikes ?? 2 }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
  const view = await render(tree());
  return { ...made, ...view, tree };
}

async function layoutStack() {
  // Give the stack's container a size, as the phone does after its first layout.
  await act(async () => {
    await fireEvent(screen.getByTestId('swipe-stack'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 353, height: 560 } },
    });
  });
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  stacks.splice(0).forEach((stack) => stack.getState().stop());
  mockSwipe.current = null;
});

describe('the buttons', () => {
  it.each([
    ['Like', 'like'],
    ['Nope', 'nope'],
    ['Seen it', 'seen'],
    ['Super like, 2 left', 'super_like'],
  ] as const)('%s queues %s and takes the card', async (label, answer) => {
    const { votes } = await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText(label));
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([[1, answer]]);
    expect(screen.getByLabelText('Film 2, 2020 · 1 h 40 · ★ 7.0')).toBeTruthy();
  });

  it('are labelled for screen readers, Undo included', async () => {
    await setup();
    await layoutStack();
    for (const label of ['Undo', 'Nope', 'Super like, 2 left', 'Like', 'Seen it']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('shows Undo disabled, with a reason for screen readers', async () => {
    await setup();
    await layoutStack();
    const undo = screen.getByLabelText('Undo');
    expect(undo.props.accessibilityState.disabled).toBe(true);
    expect(undo.props.accessibilityHint).toBe('Nothing to undo');
    await fireEvent.press(undo);
  });

  it('keep answering while the last card is still flying', async () => {
    const { votes } = await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Like'));
    await fireEvent.press(screen.getByLabelText('Nope'));
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([
      [1, 'like'],
      [2, 'nope'],
      [3, 'like'],
    ]);
  });
});

describe('super likes', () => {
  it('count down at once with each queued one, and the button goes at 0 without a word', async () => {
    const { votes } = await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Super like, 2 left'));
    expect(screen.getByLabelText('Super like, 1 left')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Super like, 1 left'));
    const none = screen.getByLabelText('No super likes left');
    expect(none.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(none);
    expect(votes.filter((v) => v.answer === 'super_like')).toHaveLength(2);
  });

  it('start at 0 when the seat has none', async () => {
    await setup({ superLikes: 0 });
    await layoutStack();
    expect(screen.getByLabelText('No super likes left').props.accessibilityState.disabled).toBe(
      true,
    );
  });
});

describe('the card for screen readers', () => {
  it('is one element that names the film and does every answer', async () => {
    const { votes } = await setup();
    await layoutStack();
    const card = screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0');
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'like',
      'nope',
      'superLike',
      'seen',
      'flip',
    ]);
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
    await fireEvent(screen.getByLabelText('Film 2, 2020 · 1 h 40 · ★ 7.0'), 'accessibilityAction', {
      nativeEvent: { actionName: 'superLike' },
    });
    await fireEvent(screen.getByLabelText('Film 3, 2020 · 1 h 40 · ★ 7.0'), 'accessibilityAction', {
      nativeEvent: { actionName: 'nope' },
    });
    await fireEvent(screen.getByLabelText('Film 4, 2020 · 1 h 40 · ★ 7.0'), 'accessibilityAction', {
      nativeEvent: { actionName: 'seen' },
    });
    expect(votes.map((v) => v.answer)).toEqual(['like', 'super_like', 'nope', 'seen']);
  });

  it('flips with its own action, and the vote remembers it', async () => {
    const { votes, stack } = await setup();
    await layoutStack();
    await fireEvent(screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0'), 'accessibilityAction', {
      nativeEvent: { actionName: 'flip' },
    });
    expect(stack.getState().flipped).toBe(true);
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(votes[0]?.flipped).toBe(true);
  });

  it('reads the whole back as one element, with a trailer action', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    await setup();
    await layoutStack();
    const front = screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0');
    expect(front.props.accessibilityActions.map((a: { name: string }) => a.name)).not.toContain(
      'trailer',
    );
    await fireEvent(front, 'accessibilityAction', { nativeEvent: { actionName: 'flip' } });
    const back = screen.getByLabelText(
      'Film 1. TMDB rating 7. A story. Director  Paul King Cast  Ben Whishaw and Hugh Grant',
      { exact: false },
    );
    expect(back.props.accessibilityActions.map((a: { name: string }) => a.name)).toContain(
      'trailer',
    );
    await fireEvent(back, 'accessibilityAction', { nativeEvent: { actionName: 'trailer' } });
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
    open.mockRestore();
  });

  it('leaves out the super like action when there are none left', async () => {
    await setup({ superLikes: 0 });
    await layoutStack();
    const card = screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0');
    expect(card.props.accessibilityActions.map((a: { name: string }) => a.name)).not.toContain(
      'superLike',
    );
  });
});

describe('offline', () => {
  it('hands the number of waiting swipes to the room banner', async () => {
    const made = await makeSwipe();
    made.swipe.waitingVotes = 6;
    mockSwipe.current = made.swipe as never;
    await render(
      <GestureHandlerRootView>
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 393, height: 852 },
            insets: { top: 47, left: 0, right: 0, bottom: 34 },
          }}
        >
          <SwipeScreen roomId={ROOM} seat={seat} />
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
    expect(mockBanner).toHaveBeenLastCalledWith({ roomId: ROOM, waitingVotes: 6 });
  });
});

describe('the room moves on', () => {
  it('takes no more answers once a match or a new state has arrived', async () => {
    const { votes } = await setup({ locked: true });
    await layoutStack();
    for (const label of ['Like', 'Nope', 'Seen it']) {
      expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(screen.getByLabelText(label));
    }
    expect(votes).toEqual([]);
  });
});

describe('the near miss', () => {
  const nearMiss = (title_id: number, likes = 2) => ({ title_id, likes, of: 3, needed: 3 });
  const send = (payload: unknown) =>
    act(async () => void mockRoomEvents.get('near_miss')?.(payload));
  const settle = () => act(async () => void jest.advanceTimersByTime(400));

  beforeEach(() => {
    // setup() waits on setImmediate for the first deal.
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    clearNearMisses();
    mockRoom.data = { reveal: 'party' };
  });
  afterEach(() => jest.useRealTimers());

  it('shows the toast and the glow on the top card, in place for a new count', async () => {
    await setup();
    await layoutStack();
    await send(nearMiss(1));
    expect(screen.queryByTestId('near-miss')).toBeNull();
    await settle();
    expect(screen.getByText('2 of 3 of you liked this')).toBeTruthy();
    expect(screen.getByTestId('swipe-glow-1')).toBeTruthy();
    await send({ title_id: 1, likes: 3, of: 4, needed: 4 });
    expect(screen.getByText('3 of 4 of you liked this')).toBeTruthy();
  });

  it('waits for a card further down, and nothing stays once the card is gone', async () => {
    await setup();
    await layoutStack();
    await settle();
    await send(nearMiss(2));
    expect(screen.queryByTestId('near-miss')).toBeNull();
    expect(screen.queryByTestId('swipe-glow-2')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Like'));
    await settle();
    expect(screen.getByText('2 of 3 of you liked this')).toBeTruthy();
    expect(screen.getByTestId('swipe-glow-2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Nope'));
    await settle();
    expect(screen.queryByText('2 of 3 of you liked this')).toBeNull();
    expect(screen.queryByTestId('swipe-glow-2')).toBeNull();
  });

  it('never takes a touch from the card, the hints or the buttons', async () => {
    await setup();
    await layoutStack();
    await send(nearMiss(1));
    await settle();
    // Drawn over the top bar's strip, apart from the stack, and it lets every touch through.
    expect(screen.getByTestId('near-miss').parent?.props.pointerEvents).toBe('none');
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.queryByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0')).toBeNull();
  });

  it('hides when the count drops below the line', async () => {
    await setup();
    await layoutStack();
    await send({ title_id: 1, likes: 3, of: 5, needed: 4 });
    await settle();
    expect(screen.getByText('3 of 5 of you liked this')).toBeTruthy();
    await send({ title_id: 1, likes: 2, of: 5, needed: 4 });
    expect(screen.queryByTestId('near-miss')).toBeNull();
    expect(screen.queryByTestId('swipe-glow-1')).toBeNull();
  });

  it('shows nothing in a blind room', async () => {
    mockRoom.data = { reveal: 'blind' };
    await setup();
    await layoutStack();
    await send(nearMiss(1));
    await settle();
    expect(screen.queryByTestId('near-miss')).toBeNull();
  });
});

describe('when there is no card', () => {
  it('shows the loading card with the answers disabled', async () => {
    await setup({ cards: 0 });
    await layoutStack();
    // An empty read: the card is loading until the server says there is nothing left.
    expect(screen.getByLabelText('Like').props.accessibilityState.disabled).toBe(true);
  });

  it('shows the waiting card offline, and the done card when the server has no more', async () => {
    const { stack } = await setup({ cards: 0 });
    await layoutStack();
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(screen.getByText("That's all your cards")).toBeTruthy();
    await act(async () => stack.getState().onOffline());
    expect(screen.getByText('Waiting for the connection')).toBeTruthy();
    expect(
      screen.getByText("Your swipes are saved. They'll go as soon as you're back."),
    ).toBeTruthy();
  });
});

describe('the rewatch question', () => {
  const ask = async (rule: 'allow_rewatch' | 'show_all' = 'allow_rewatch') => {
    const made = await setup({ seenRule: rule });
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Seen it'));
    return made;
  };

  it.each(['allow_rewatch', 'show_all'] as const)(
    'opens on Seen it under %s and queues nothing',
    async (rule) => {
      const { votes, stack } = await ask(rule);
      expect(screen.getByText('Watch it again tonight?')).toBeTruthy();
      expect(votes).toEqual([]);
      expect(stack.getState().mounted[0]?.title_id).toBe(1);
    },
  );

  it('opens from the screen reader action too', async () => {
    const { votes } = await setup({ seenRule: 'allow_rewatch' });
    await layoutStack();
    await fireEvent(screen.getByTestId('swipe-card-1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'seen' },
    });
    expect(screen.getByText('Watch it again tonight?')).toBeTruthy();
    expect(votes).toEqual([]);
  });

  it('Yes sends seen_rewatch and takes the card', async () => {
    const { votes } = await ask();
    await fireEvent.press(screen.getByLabelText('Yes, watch it again tonight'));
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([[1, 'seen_rewatch']]);
    expect(screen.queryByText('Watch it again tonight?')).toBeNull();
  });

  it('No sends seen and takes the card', async () => {
    const { votes } = await ask();
    await fireEvent.press(screen.getByLabelText('No, not tonight'));
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([[1, 'seen']]);
  });

  it('answers once when Yes is tapped twice', async () => {
    const { votes } = await ask();
    const yes = screen.getByLabelText('Yes, watch it again tonight');
    await fireEvent.press(yes);
    await fireEvent.press(yes);
    expect(votes).toHaveLength(1);
  });

  it('closes with no vote when the screen reader escapes', async () => {
    const { votes, stack } = await ask();
    await fireEvent(screen.getByTestId('seen-question'), 'accessibilityEscape');
    expect(screen.queryByText('Watch it again tonight?')).toBeNull();
    expect(votes).toEqual([]);
    expect(stack.getState().mounted[0]?.title_id).toBe(1);
  });

  it('closes with no vote when the room moves on', async () => {
    const { votes, swipe, rerender, tree } = await ask();
    (swipe as { locked: boolean }).locked = true;
    await rerender(tree());
    expect(screen.queryByText('Watch it again tonight?')).toBeNull();
    expect(votes).toEqual([]);
  });

  it('is not asked under hide_seen: Seen it sends seen at once', async () => {
    const { votes } = await setup({ seenRule: 'hide_seen' });
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Seen it'));
    expect(screen.queryByText('Watch it again tonight?')).toBeNull();
    expect(votes.map((v) => v.answer)).toEqual(['seen']);
  });
});

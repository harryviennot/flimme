import i18n from '@/i18n';

import type { NextCard, RoomSeat } from '@flimme/contract';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStore } from 'zustand/vanilla';

import { createAnswerer, type Answerer } from '@/features/swipe/answer';
import { createCardStack, type CardStack } from '@/features/swipe/card-stack';
import { createUndoer } from '@/features/swipe/undo';
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

async function makeSwipe(options: { cards?: number; locked?: boolean; superLikes?: number } = {}) {
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
  const undone: number[] = [];
  const undoer = createUndoer({
    stack,
    queue: {
      removeLast: () => null,
      enqueueUndo: (item) => void undone.push(item.title_id),
    },
    roomId: ROOM,
    memberId: seat.member_id,
    locked: () => false,
  });
  const state = createStore(() => ({
    superLikesLeft: answerer.superLikesLeft(),
    returning: null as ReturnType<typeof undoer.undo>,
  }));
  return {
    stack,
    votes,
    counts,
    undone,
    state,
    swipe: {
      stack,
      answer: (kind: Parameters<Answerer['answer']>[0]) => {
        const done = answerer.answer(kind);
        if (done) undoer.record(done.card, kind);
        state.setState({ superLikesLeft: answerer.superLikesLeft(), returning: null });
        return done;
      },
      undo: () => {
        const back = undoer.undo();
        if (back?.kind === 'super_like') answerer.giveBackSuperLike();
        state.setState({ superLikesLeft: answerer.superLikesLeft(), returning: back });
        return back;
      },
      get canUndo() {
        return undoer.state.getState().last !== null;
      },
      get returning() {
        return state.getState().returning;
      },
      get superLikesLeft() {
        return state.getState().superLikesLeft;
      },
      waitingVotes: 0,
      locked: options.locked ?? false,
      online: true,
      imageBase: undefined,
    },
  };
}

// `makeSwipe` resolves to a pair; the mock hook only needs `swipe`.
async function setup(options: Parameters<typeof makeSwipe>[0] = {}) {
  const made = await makeSwipe(options);
  mockSwipe.current = made.swipe as never;
  const view = () =>
    render(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 393, height: 852 },
            insets: { top: 47, left: 0, right: 0, bottom: 34 },
          }}
        >
          <SwipeScreen
            roomId={ROOM}
            seat={{ ...seat, super_likes_left: options.superLikes ?? 2 }}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    );
  return { ...made, ...(await view()) };
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

  it('wakes Undo with the first answer, brings the card back and sleeps it again', async () => {
    const { undone } = await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Nope'));
    expect(screen.getByLabelText('Film 2, 2020 · 1 h 40 · ★ 7.0')).toBeTruthy();
    const undo = screen.getByLabelText('Undo');
    expect(undo.props.accessibilityState.disabled).toBeFalsy();
    await fireEvent.press(undo);
    expect(undone).toEqual([1]);
    expect(screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0')).toBeTruthy();
    expect(screen.getByLabelText('Undo').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(undone).toEqual([1]);
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.getByLabelText('Undo').props.accessibilityState.disabled).toBeFalsy();
  });

  it('gives a super like back to the badge when it is undone', async () => {
    await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Super like, 2 left'));
    expect(screen.getByLabelText('Super like, 1 left')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(screen.getByLabelText('Super like, 2 left')).toBeTruthy();
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

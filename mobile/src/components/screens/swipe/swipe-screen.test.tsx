import { createSoloSession } from '@/features/solo/session';
import i18n from '@/i18n';

import type { NextCard, RoomSeat } from '@flimme/contract';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStore } from 'zustand/vanilla';

import { useHintsStore } from '@/features/swipe/hints';
import { track } from '@/lib/analytics';
import { clearNearMisses, recordNearMiss } from '@/features/swipe/near-miss';
import { duration } from '@/theme/motion';
import { createAnswerer, type Answerer } from '@/features/swipe/answer';
import { createCardStack, type CardStack } from '@/features/swipe/card-stack';
import { createShortlistController } from '@/features/shortlist/controller';
import { ShortlistProvider } from '@/features/shortlist/context';
import { createUndoer } from '@/features/swipe/undo';
import type { QueuedVote } from '@/features/swipe/vote-queue';

import { SwipeScreen } from './swipe-screen';

// The swipe screen over a real card stack and a real answer path, with the vote queue and the
// room's channels faked. The drag itself is a gesture on the UI thread and is covered by
// feel.test.ts (the rules) and the Maestro run (the finger).

const mockSwipe: { current: ReturnType<typeof makeSwipe> | null } = { current: null };
const mockToggleSaved = jest.fn((id: number) => id > 0);
jest.mock('@/features/later', () => ({
  toggleSaved: (id: number) => mockToggleSaved(id),
  useIsSaved: () => false,
  useSettleSaves: () => undefined,
}));
jest.mock('@/features/swipe/use-swipe', () => ({ useSwipe: () => mockSwipe.current }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({
  haptics: { throw: jest.fn(), press: jest.fn(), commit: jest.fn(), checkpoint: jest.fn() },
}));
const mockBanner = jest.fn();
jest.mock('@/components/screens/room/room-banner', () => ({
  RoomBanner: (props: { roomId: string; waitingVotes: number }) => {
    mockBanner(props);
    return null;
  },
}));

// The top bar has its own test (top-bar.test.tsx).
jest.mock('@/features/shortlist/use-shortlist-cards', () => ({
  useShortlistCards: (_room: string, ids: number[]) =>
    new Map(ids.map((id) => [id, { title: `Film ${id}`, posterUri: null }])),
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('./top-bar', () => ({ SwipeTopBar: () => null }));
jest.mock('@/features/swipe/index', () => ({ voteQueue: { has: () => false } }));
const mockRoomEvents = new Map<string, (payload: unknown) => void>();
const mockRoom: { data: Record<string, unknown> } = {
  data: { reveal: 'party', max_age: null },
};
jest.mock('@/features/host/queries', () => ({
  useCountryProviders: () => ({
    data: [
      { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
      { provider_id: 119, name: 'Prime Video', logo_path: null, display_priority: 2 },
    ],
  }),
}));
jest.mock('@/features/solo/leave', () => ({
  useLeaveSolo: () => jest.fn(),
  useLeaveSoloTo: () => ({ myFilms: jest.fn(), host: jest.fn() }),
}));
jest.mock('@/features/solo/cap', () => ({ markCapReached: jest.fn() }));
jest.mock('@/features/room', () => ({
  // A room without filters, unless a test sets some.
  useRoom: () => ({
    data: {
      provider_ids: [],
      runtime_max: null,
      seen_rule: 'allow_rewatch',
      quality: 'standard',
      ...mockRoom.data,
    },
  }),
  useRoomSeats: () => ({ data: [] }),
  useMySeat: () => ({ role: 'guest' }),
  useRoomEvent: (_room: string, event: string, handler: (payload: unknown) => void) => {
    mockRoomEvents.set(event, handler);
  },
}));

const ROOM = 'room-1';

// The genres list is a query that may not be cached yet: the card shows its genre only when it is.
const mockGenres: { data: unknown } = { data: undefined };
jest.mock('@/features/lobby/queries', () => ({ useGenres: () => mockGenres }));

function film(id: number): NextCard {
  return {
    title_id: id,
    tmdb_id: id,
    title: `Film ${id}`,
    overview: 'A story.',
    year: 2020,
    runtime_min: 100,
    genre_ids: id === 1 ? [53] : [],
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
    seen: false,
    saved: false,
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
    /** The server answers `done` with this many films liked. */
    doneLiked?: number;
    /** The room's shortlist; a beat plays when it is given a signal. */
    shortlist?: ReturnType<typeof createShortlistController>;
    /** The last card answered is on the shortlist. */
    undoShortlisted?: boolean;
    /** A solo room: the session, the likes count, the checkpoint. */
    solo?: boolean;
    /** `request_cards` answers `daily_limit`. */
    capped?: boolean;
    /** Films the player has already seen or saved, by id (the card's own flags, M6.65). */
    seenIds?: number[];
    savedIds?: number[];
  } = {},
) {
  const votes: QueuedVote[] = [];
  const cards = Array.from({ length: options.cards ?? 20 }, (_, i) => ({
    ...film(i + 1),
    seen: options.seenIds?.includes(i + 1) ?? false,
    saved: options.savedIds?.includes(i + 1) ?? false,
  }));
  const stack = createCardStack(
    {
      fetchCards: async () => cards.filter((c) => !votes.some((v) => v.title_id === c.title_id)),
      requestCards: async () =>
        options.capped
          ? 'daily_limit'
          : options.doneLiked === undefined
            ? 'ok'
            : { status: 'done' as const, liked: options.doneLiked },
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
  const soloSession = createSoloSession();
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
        if (done) {
          undoer.record(done.card, kind);
          soloSession.getState().answer(done.card, kind);
        }
        state.setState({ superLikesLeft: answerer.superLikesLeft(), returning: null });
        return done;
      },
      undo: () => {
        const back = undoer.undo();
        if (back) soloSession.getState().undo(back.card.title_id);
        if (back?.kind === 'super_like') answerer.giveBackSuperLike();
        state.setState({ superLikesLeft: answerer.superLikesLeft(), returning: back });
        return back;
      },
      rewatch: (titleId: number) => {
        const last = undoer.state.getState().last;
        if (!last || last.card.title_id !== titleId || last.kind !== 'seen') return false;
        if (!undoer.change('seen_rewatch')) return false;
        answerer.change(titleId, 'seen_rewatch');
        return true;
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
      get beating() {
        return options.shortlist?.getSnapshot().active ?? false;
      },
      undoShortlisted: options.undoShortlisted ?? false,
      solo: options.solo ?? false,
      soloSession,
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
        <ShortlistProvider value={options.shortlist ?? null}>
          <SwipeScreen
            roomId={ROOM}
            seat={{ ...seat, super_likes_left: options.superLikes ?? 2 }}
          />
        </ShortlistProvider>
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
  useHintsStore.setState({
    done: { swipe: false, seen: false, flip: false, superLikes: false },
  });
  stacks.splice(0).forEach((stack) => stack.getState().stop());
  mockSwipe.current = null;
  // Near miss counts live in memory for the game: none may reach the next test.
  clearNearMisses();
  mockRoom.data = { reveal: 'party', max_age: null };
});

describe('the genre on the card', () => {
  afterEach(() => {
    mockGenres.data = undefined;
  });

  it('is left out until the genres are cached', async () => {
    await setup();
    await layoutStack();
    expect(screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0')).toBeTruthy();
  });

  it('is the first one, once they are', async () => {
    mockGenres.data = [{ id: 53, slug: 'thriller', names: { fr: 'Thriller', en: 'Thriller' } }];
    await setup();
    await layoutStack();
    expect(screen.getByLabelText('Film 1, 2020 · 1 h 40 · Thriller · ★ 7.0')).toBeTruthy();
  });
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

describe('a film the player has already seen or saved (M6.66)', () => {
  it('disables Seen it with a tick, silent, while Like and Nope still answer', async () => {
    const { votes } = await setup({ seenIds: [1] });
    await layoutStack();
    expect(screen.queryByLabelText('Seen it')).toBeNull();
    const seen = screen.getByLabelText('Seen it, already marked');
    expect(seen.props.accessibilityState.disabled).toBe(true);
    expect(seen.props.accessibilityHint).toBe('This film is already in My films, Seen');
    await fireEvent.press(seen);
    expect(votes).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([[1, 'like']]);
    // The next film was not seen: the button is back.
    expect(screen.getByLabelText('Seen it').props.accessibilityState.disabled).toBeFalsy();
  });

  it('says it in French', async () => {
    await i18n.changeLanguage('fr');
    try {
      await setup({ seenIds: [1] });
      await layoutStack();
      expect(screen.getByLabelText('Déjà vu, déjà noté').props.accessibilityState.disabled).toBe(
        true,
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('takes the seen and save actions off the card for screen readers', async () => {
    await setup({ seenIds: [1], savedIds: [1] });
    await layoutStack();
    const card = screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0');
    expect(card.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'like',
      'nope',
      'superLike',
      'flip',
    ]);
  });

  it('shows the bookmark ticked and disabled for a film already in My films', async () => {
    await setup({ savedIds: [1] });
    await layoutStack();
    const bookmark = screen.getAllByLabelText('Already in My films')[0]!;
    expect(bookmark.props.accessibilityState).toMatchObject({ disabled: true, selected: true });
    await fireEvent.press(bookmark);
    expect(mockToggleSaved).not.toHaveBeenCalled();
  });
});

describe('the card for screen readers', () => {
  beforeEach(() => {
    mockRoom.data = { reveal: 'party', max_age: null };
  });

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
      'save',
    ]);
    // Saving (a solo like) is not an answer: it sends no vote and the card stays.
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'save' } });
    expect(mockToggleSaved).toHaveBeenCalledWith(1);
    expect(votes).toHaveLength(0);
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

  it.each([0, 10, 12])('has no trailer action in a room capped at %i', async (maxAge) => {
    mockRoom.data = { reveal: 'party', max_age: maxAge };
    await setup();
    await layoutStack();
    const front = screen.getByLabelText('Film 1, 2020 · 1 h 40 · ★ 7.0');
    await fireEvent(front, 'accessibilityAction', { nativeEvent: { actionName: 'flip' } });
    const back = screen.getByLabelText('Film 1. TMDB rating 7.', { exact: false });
    expect(back.props.accessibilityActions.map((a: { name: string }) => a.name)).not.toContain(
      'trailer',
    );
    expect(screen.queryByLabelText('Trailer')).toBeNull();
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
    mockRoom.data = { reveal: 'party', max_age: null };
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

describe('the done card', () => {
  const doneRoom = {
    reveal: 'party',
    max_age: 12,
    runtime_max: 105,
    seen_rule: 'hide_seen',
    quality: 'standard',
    provider_ids: [8, 119],
    country: 'FR',
  };

  it("shows tonight's filters and how many films the room liked", async () => {
    mockRoom.data = doneRoom;
    await setup({ cards: 0, doneLiked: 3 });
    await layoutStack();
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(screen.getByText("That's all your cards")).toBeTruthy();
    expect(track).toHaveBeenCalledWith('game:nothing_left_view', { is_host: false });
    expect(screen.getByText("Tonight's filters")).toBeTruthy();
    expect(screen.getByText('Netflix')).toBeTruthy();
    expect(screen.getByText('Prime Video')).toBeTruthy();
    expect(screen.getByText('Under 1 h 45')).toBeTruthy();
    expect(screen.getByText('Ages 12+')).toBeTruthy();
    expect(screen.getByText('Unseen only')).toBeTruthy();
    expect(screen.getByText('3 films liked so far')).toBeTruthy();
  });

  it('says 0 films and 1 film in the right plural, in both languages', async () => {
    mockRoom.data = doneRoom;
    await setup({ cards: 0, doneLiked: 1 });
    await layoutStack();
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(screen.getByText('1 film liked so far')).toBeTruthy();
    expect(i18n.getFixedT('en', 'ending')('nothingLeft.liked', { count: 0 })).toBe(
      '0 films liked so far',
    );
    expect(i18n.getFixedT('fr', 'ending')('nothingLeft.liked', { count: 0 })).toBe(
      "0 film aimé pour l'instant",
    );
    expect(i18n.getFixedT('fr', 'ending')('nothingLeft.liked', { count: 2 })).toBe(
      "2 films aimés pour l'instant",
    );
  });

  it('leaves out the filter line for a room without filters, and has no buttons of its own', async () => {
    mockRoom.data = {
      ...doneRoom,
      max_age: null,
      runtime_max: null,
      seen_rule: 'allow_rewatch',
      provider_ids: [],
    };
    await setup({ cards: 0, doneLiked: 0 });
    await layoutStack();
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(screen.queryByText("Tonight's filters")).toBeNull();
    expect(screen.getByText('0 films liked so far')).toBeTruthy();
    expect(screen.queryByText('Change filters')).toBeNull();
    expect(screen.queryByText('Vote now')).toBeNull();
    expect(screen.getByLabelText('Like').props.accessibilityState.disabled).toBe(true);
  });
});

const SWIPE_HINT = 'Swipe right to like, left to nope.';
const SEEN_HINT = "Seen it? Swipe up. We'll ask if you'd watch it again.";
const FLIP_HINT = 'Tap the card for the story.';
const SUPER_HINT = '2 super likes per game. They count double if it comes to a final vote.';

describe('the first-game hints', () => {
  it('walk the first cards: swipe, Seen it, then the flip hint, each at its card', async () => {
    await setup();
    await layoutStack();
    expect(screen.getByText(SWIPE_HINT)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.queryByText(SWIPE_HINT)).toBeNull();
    expect(screen.getByText(SEEN_HINT)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.queryByText(SEEN_HINT)).toBeNull();
    expect(screen.getByText(FLIP_HINT)).toBeTruthy();
  });

  it('report each hint once, as game:hint_show, in the order they show', async () => {
    jest.mocked(track).mockClear();
    await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Like'));
    await fireEvent.press(screen.getByLabelText('Like'));
    const hints = jest
      .mocked(track)
      .mock.calls.filter(([name]) => name === 'game:hint_show')
      .map(([, props]) => props);
    expect(hints).toEqual([{ hint: 'swipe' }, { hint: 'seen_it' }, { hint: 'flip' }]);
  });

  it('drop the Seen it hint at the first Seen it', async () => {
    await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Like'));
    await fireEvent.press(screen.getByLabelText('Seen it'));
    expect(screen.queryByText(SEEN_HINT)).toBeNull();
    expect(useHintsStore.getState().done.seen).toBe(true);
  });

  it('show the super likes hint at the first star tap and keep it until dismissed', async () => {
    await setup();
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Super like, 2 left'));
    expect(screen.getByText(SUPER_HINT)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Like'));
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.getByText(SUPER_HINT)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Hide this tip'));
    expect(screen.queryByText(SUPER_HINT)).toBeNull();
    expect(useHintsStore.getState().done.superLikes).toBe(true);
  });

  it('show the super likes hint at card 5 without a star tap', async () => {
    await setup();
    await layoutStack();
    for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByLabelText('Nope'));
    expect(screen.getByText(SUPER_HINT)).toBeTruthy();
  });

  it('never come back once gone, and one not finished shows in the next game', async () => {
    useHintsStore.setState({ done: { swipe: true, seen: true, flip: false, superLikes: false } });
    const first = await setup();
    await layoutStack();
    expect(screen.queryByText(SWIPE_HINT)).toBeNull();
    expect(first.votes).toHaveLength(0);
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.queryByText(SEEN_HINT)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.getByText(FLIP_HINT)).toBeTruthy();
  });

  it('show nothing at all in a second game', async () => {
    useHintsStore.setState({ done: { swipe: true, seen: true, flip: true, superLikes: true } });
    await setup();
    await layoutStack();
    for (let i = 0; i < 6; i++) await fireEvent.press(screen.getByLabelText('Nope'));
    for (const text of [SWIPE_HINT, SEEN_HINT, FLIP_HINT, SUPER_HINT]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });
});

describe('the rewatch chip', () => {
  const CHIP = 'Seen it. Watch it again tonight?';
  const DONE = 'Up for a rewatch';
  const YES = 'Yes, watch it again tonight';

  const seenIt = async (rule: 'allow_rewatch' | 'show_all' | 'hide_seen' = 'allow_rewatch') => {
    const made = await setup({ seenRule: rule });
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Seen it'));
    return made;
  };

  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it.each(['allow_rewatch', 'show_all'] as const)(
    'one tap on Seen it sends seen at once and shows the chip under %s',
    async (rule) => {
      const { votes, stack } = await seenIt(rule);
      expect(votes.map((v) => [v.title_id, v.answer])).toEqual([[1, 'seen']]);
      expect(stack.getState().mounted[0]?.title_id).toBe(2);
      expect(screen.getByText(CHIP)).toBeTruthy();
      expect(screen.getByLabelText(YES)).toBeTruthy();
    },
  );

  it('shows the chip after the screen reader action too', async () => {
    const { votes } = await setup({ seenRule: 'allow_rewatch' });
    await layoutStack();
    await fireEvent(screen.getByTestId('swipe-card-1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'seen' },
    });
    expect(votes.map((v) => v.answer)).toEqual(['seen']);
    expect(screen.getByText(CHIP)).toBeTruthy();
  });

  it('is not offered under hide_seen: the film just leaves', async () => {
    const { votes } = await seenIt('hide_seen');
    expect(votes.map((v) => v.answer)).toEqual(['seen']);
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it('is not offered for a like or a nope', async () => {
    await setup({ seenRule: 'allow_rewatch' });
    await layoutStack();
    await fireEvent.press(screen.getByLabelText('Like'));
    await fireEvent.press(screen.getByLabelText('Nope'));
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it('a fast double tap on Seen it sends two seen votes and never a like', async () => {
    const { votes, undone } = await seenIt();
    await fireEvent.press(screen.getByLabelText('Seen it'));
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([
      [1, 'seen'],
      [2, 'seen'],
    ]);
    expect(undone).toEqual([]);
    expect(screen.getByText(CHIP)).toBeTruthy();
  });

  it('Yes turns the answer into seen_rewatch: an undo, then the new vote, for the same film', async () => {
    const { votes, undone, stack } = await seenIt();
    await fireEvent.press(screen.getByLabelText(YES));
    expect(undone).toEqual([1]);
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([
      [1, 'seen'],
      [1, 'seen_rewatch'],
    ]);
    // No card comes back or moves.
    expect(stack.getState().mounted[0]?.title_id).toBe(2);
    expect(screen.getByText(DONE)).toBeTruthy();
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it('Yes tapped twice changes the answer once', async () => {
    const { votes, undone } = await seenIt();
    const yes = screen.getByLabelText(YES);
    await fireEvent.press(yes);
    await fireEvent.press(yes);
    expect(undone).toEqual([1]);
    expect(votes.filter((v) => v.answer === 'seen_rewatch')).toHaveLength(1);
  });

  it('confirms for 1.5 seconds, then the line is empty', async () => {
    await seenIt();
    await fireEvent.press(screen.getByLabelText(YES));
    await act(async () => void jest.advanceTimersByTime(1499));
    expect(screen.getByText(DONE)).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(1));
    expect(screen.queryByText(DONE)).toBeNull();
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it('leaves after 5 seconds with no vote changed', async () => {
    const { votes, undone } = await seenIt();
    await act(async () => void jest.advanceTimersByTime(4999));
    expect(screen.getByText(CHIP)).toBeTruthy();
    await act(async () => void jest.advanceTimersByTime(1));
    expect(screen.queryByText(CHIP)).toBeNull();
    expect(votes.map((v) => v.answer)).toEqual(['seen']);
    expect(undone).toEqual([]);
  });

  it('stays past 5 seconds while a screen reader is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    await seenIt();
    await act(async () => void jest.advanceTimersByTime(60_000));
    expect(screen.getByText(CHIP)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(YES));
    expect(screen.getByText(DONE)).toBeTruthy();
  });

  it('leaves at the next answer', async () => {
    await seenIt();
    await fireEvent.press(screen.getByLabelText('Like'));
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it('leaves when Undo takes the Seen it back, and a new Seen it brings it again', async () => {
    const { undone } = await seenIt();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(undone).toEqual([1]);
    expect(screen.queryByText(CHIP)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Seen it'));
    expect(screen.getByText(CHIP)).toBeTruthy();
  });

  it('leaves when the room moves on', async () => {
    const { swipe, rerender, tree } = await seenIt();
    (swipe as { locked: boolean }).locked = true;
    await rerender(tree());
    expect(screen.queryByText(CHIP)).toBeNull();
  });

  it('Undo after Yes takes the rewatch back', async () => {
    const { undone } = await seenIt();
    await fireEvent.press(screen.getByLabelText(YES));
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(undone).toEqual([1, 1]);
  });

  it('shows in French too', async () => {
    await i18n.changeLanguage('fr');
    try {
      await setup({ seenRule: 'allow_rewatch' });
      await layoutStack();
      await fireEvent.press(screen.getByLabelText('Déjà vu'));
      expect(screen.getByText('Déjà vu. On le revoit ce soir ?')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Oui, on le revoit ce soir'));
      expect(screen.getByText('Partant pour le revoir')).toBeTruthy();
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('the shortlisted beat', () => {
  const controller = () =>
    createShortlistController({ onBeat: () => undefined, onMismatch: () => undefined });
  const match = (title_id: number, shortlisted = 1) => ({
    title_id,
    likes: 3,
    of: 3,
    decided: false,
    shortlisted,
    shortlist_size: 3,
  });

  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('has no layer and no catcher while nothing matched', async () => {
    await setup({ shortlist: controller() });
    expect(screen.queryByTestId('shortlisted')).toBeNull();
    expect(screen.queryByTestId('shortlisted-catcher')).toBeNull();
  });

  it('puts a layer over the stack and a catcher over the buttons, then takes both away', async () => {
    const shortlist = controller();
    const { votes } = await setup({ shortlist });
    await layoutStack();
    await act(async () => shortlist.signal(match(7)));
    expect(screen.getByTestId('shortlisted')).toBeTruthy();
    expect(screen.getByTestId('shortlisted-catcher')).toBeTruthy();
    // The buttons keep their look: nothing is disabled for the beat.
    expect(screen.getByLabelText('Like').props.accessibilityState.disabled).toBe(false);
    await act(async () => void jest.advanceTimersByTime(1750));
    expect(screen.queryByTestId('shortlisted')).toBeNull();
    expect(screen.queryByTestId('shortlisted-catcher')).toBeNull();
    expect(votes).toEqual([]);
  });

  it('takes the near-miss toast away while it plays and brings it back after', async () => {
    const shortlist = controller();
    await setup({ shortlist });
    await layoutStack();
    await act(async () => recordNearMiss(ROOM, { title_id: 1, likes: 2, of: 3, needed: 3 }));
    await act(async () => void jest.advanceTimersByTime(400));
    expect(screen.queryByTestId('near-miss')).toBeTruthy();
    await act(async () => shortlist.signal(match(7)));
    expect(screen.queryByTestId('near-miss')).toBeNull();
    await act(async () => void jest.advanceTimersByTime(1750));
    expect(screen.queryByTestId('near-miss')).toBeTruthy();
  });

  it('tells a screen reader why Undo is off after a match', async () => {
    await setup({ undoShortlisted: true });
    await layoutStack();
    expect(screen.getByLabelText('Undo').props.accessibilityHint).toBe(
      'This film is on the shortlist',
    );
  });
});

describe('a solo room', () => {
  // A checkpoint takes 20 to 40 presses: slow when the whole suite runs at once.
  jest.setTimeout(60000);
  async function answer(label: string, times: number) {
    for (let i = 0; i < times; i++) {
      await fireEvent.press(screen.getByLabelText(label));
    }
  }
  const SINGLE = "You liked 1 film. It's in My films.";

  it('shows the Solo bar with the likes count, which follows likes, super likes and undos', async () => {
    await setup({ solo: true, cards: 45 });
    await layoutStack();
    expect(screen.getByText('Solo')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 films liked')).toBeOnTheScreen();
    await answer('Like', 1);
    await answer('Nope', 1);
    await fireEvent.press(screen.getByLabelText('Super like'));
    expect(screen.getByLabelText('2 films liked')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(screen.getByLabelText('1 film liked')).toBeOnTheScreen();
  });

  it('leaves out the shortlist, the near miss, the match overlay and the host menu', async () => {
    await setup({ solo: true, cards: 45 });
    await layoutStack();
    // A count kept for the top card stays hidden, once the card has settled.
    await act(async () => recordNearMiss(ROOM, { title_id: 1, likes: 2, of: 3, needed: 3 }));
    await act(() => new Promise((resolve) => setTimeout(resolve, duration.base + 100)));
    expect(screen.queryByTestId('shortlist')).toBeNull();
    expect(screen.queryByTestId('shortlisted-catcher')).toBeNull();
    expect(screen.queryByText(/of you liked/i)).toBeNull();
    expect(screen.queryByLabelText(/^Remove /)).toBeNull();
    expect(screen.queryByLabelText(/Report/)).toBeNull();
  });

  it('shows no super like count', async () => {
    await setup({ solo: true, cards: 45 });
    await layoutStack();
    expect(screen.queryByLabelText(/left/)).toBeNull();
    expect(screen.getByLabelText('Super like')).toBeOnTheScreen();
  });

  it('shows the checkpoint after the 20th answer, with both choices and the answers off', async () => {
    const { votes } = await setup({ solo: true, cards: 45 });
    await layoutStack();
    await answer('Like', 1);
    await answer('Nope', 18);
    expect(screen.queryByTestId('checkpoint-card')).toBeNull();
    await answer('Nope', 1);
    expect(screen.getByTestId('checkpoint-card')).toBeOnTheScreen();
    expect(screen.getByText(SINGLE)).toBeOnTheScreen();
    expect(screen.getByText('Pick one')).toBeOnTheScreen();
    expect(screen.getByText('Keep going')).toBeOnTheScreen();
    expect(screen.getByLabelText('Like').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Undo').props.accessibilityState.disabled).toBe(false);
    // Keep going goes back to the deck and sends no vote.
    await fireEvent.press(screen.getByText('Keep going'));
    expect(screen.queryByTestId('checkpoint-card')).toBeNull();
    expect(votes).toHaveLength(20);
    // The 40th shows it again.
    await answer('Nope', 20);
    expect(screen.getByTestId('checkpoint-card')).toBeOnTheScreen();
  });

  it('opens the pick sheet from Pick one and leaves the checkpoint in place', async () => {
    await setup({ solo: true, cards: 45 });
    await layoutStack();
    await answer('Like', 1);
    await answer('Nope', 19);
    await fireEvent.press(screen.getByText('Pick one'));
    expect(router.push).toHaveBeenLastCalledWith('/room/room-1/pick');
    expect(screen.getByTestId('checkpoint-card')).toBeOnTheScreen();
  });

  it('has only Keep going when nothing was liked', async () => {
    await setup({ solo: true, cards: 45 });
    await layoutStack();
    await answer('Nope', 20);
    expect(screen.getByText('Nothing yet. Keep going?')).toBeOnTheScreen();
    expect(screen.queryByText('Pick one')).toBeNull();
    expect(screen.getByText('Keep going')).toBeOnTheScreen();
  });

  it('takes the checkpoint away on Undo and does not bring it back for the same 20th', async () => {
    await setup({ solo: true, cards: 45 });
    await layoutStack();
    await answer('Nope', 20);
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(screen.queryByTestId('checkpoint-card')).toBeNull();
    await answer('Nope', 1);
    expect(screen.queryByTestId('checkpoint-card')).toBeNull();
  });

  it('shows the out of films card with the likes and My films', async () => {
    await setup({ solo: true, cards: 2, doneLiked: 1 });
    await layoutStack();
    await answer('Like', 1);
    await answer('Nope', 1);
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(screen.getByText("That's every film for these filters.")).toBeOnTheScreen();
    expect(screen.getByText(SINGLE)).toBeOnTheScreen();
    expect(screen.getByText('Pick one')).toBeOnTheScreen();
    expect(screen.getByText('My films')).toBeOnTheScreen();
    expect(screen.queryByText('Host a movie night')).toBeNull();
  });

  it('shows the cap card after the last card, never before, with Pick one when there is a like', async () => {
    await setup({ solo: true, cards: 2, capped: true });
    await layoutStack();
    await answer('Like', 1);
    expect(screen.queryByText("That's today's solo deck.")).toBeNull();
    await answer('Nope', 1);
    expect(screen.getByText("That's today's solo deck.")).toBeOnTheScreen();
    expect(screen.getByText('New cards tomorrow.')).toBeOnTheScreen();
    expect(screen.getByText('Pick one')).toBeOnTheScreen();
    expect(screen.getByText('My films')).toBeOnTheScreen();
    expect(screen.getByText('Host a movie night')).toBeOnTheScreen();
  });

  it('shows the cap card with My films and Host only when there is no like', async () => {
    await setup({ solo: true, cards: 1, capped: true });
    await layoutStack();
    await answer('Nope', 1);
    expect(screen.queryByText('Pick one')).toBeNull();
    expect(screen.getByText('Host a movie night')).toBeOnTheScreen();
  });
});

import type { NextCard } from '@flimme/contract';

import { asksRewatch, createAnswerer, offersRewatch, PRESENCE_EVERY } from './answer';
import { createCardStack, type CardStack } from './card-stack';
import type { QueuedVote } from './vote-queue';

const ROOM = 'room-1';
const ME = 'member-1';

function card(id: number): NextCard {
  return {
    title_id: id,
    tmdb_id: id,
    title: `Film ${id}`,
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
    seen: false,
    saved: false,
  };
}

const stacks: CardStack[] = [];
afterEach(() => {
  // The stack's retry timer would keep the test run open.
  stacks.splice(0).forEach((stack) => stack.getState().stop());
});

async function setup(options: { superLeft?: number; locked?: boolean; cards?: number } = {}) {
  let clock = 1_000;
  const votes: QueuedVote[] = [];
  const counts: number[] = [];
  const state = { locked: options.locked ?? false };
  const stack = createCardStack(
    {
      fetchCards: async (limit) =>
        Array.from({ length: options.cards ?? 40 }, (_, i) => card(i + 1))
          .filter((c) => !votes.some((v) => v.title_id === c.title_id))
          .slice(0, limit),
      requestCards: async () => 'ok',
      prefetch: () => undefined,
      isAnswered: (id) => votes.some((v) => v.title_id === id),
      now: () => clock,
    },
    { screenWidth: 393 },
  );
  stacks.push(stack);
  stack.getState().start();
  await new Promise((resolve) => setImmediate(resolve));
  const answerer = createAnswerer({
    stack,
    queue: {
      enqueue: (vote) => void votes.push(vote),
      pendingSuperLikes: () => votes.filter((v) => v.answer === 'super_like').length,
    },
    roomId: ROOM,
    memberId: ME,
    initialSuperLikes: options.superLeft ?? 2,
    initialCount: 0,
    locked: () => state.locked,
    now: () => clock,
    onCount: (n) => void counts.push(n),
  });
  return {
    stack,
    answerer,
    votes,
    counts,
    state,
    tick: (ms: number) => void (clock += ms),
  };
}

describe('answer', () => {
  it('takes the top card and queues its vote with the dwell time and the flip', async () => {
    const { answerer, votes, stack, tick } = await setup();
    tick(1_250);
    stack.getState().setFlipped(true);
    const done = answerer.answer('like');
    expect(done?.card.title_id).toBe(1);
    expect(votes).toEqual([
      {
        room_id: ROOM,
        member_id: ME,
        title_id: 1,
        answer: 'like',
        dwell_ms: 1250,
        client_at: new Date(2_250).toISOString(),
        flipped: true,
      },
    ]);
    expect(stack.getState().mounted[0]?.title_id).toBe(2);
  });

  it.each(['like', 'nope', 'super_like', 'seen'] as const)('queues a %s', async (kind) => {
    const { answerer, votes } = await setup();
    answerer.answer(kind);
    expect(votes.map((v) => v.answer)).toEqual([kind]);
  });

  it('answers cards in order, each once', async () => {
    const { answerer, votes } = await setup();
    answerer.answer('like');
    answerer.answer('nope');
    answerer.answer('seen');
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([
      [1, 'like'],
      [2, 'nope'],
      [3, 'seen'],
    ]);
  });

  it('does nothing without a top card', async () => {
    const { answerer, votes } = await setup({ cards: 0 });
    expect(answerer.answer('like')).toBeNull();
    expect(votes).toEqual([]);
  });

  it('takes no input once the room has moved on', async () => {
    const { answerer, votes, state, stack } = await setup();
    state.locked = true;
    expect(answerer.answer('like')).toBeNull();
    expect(votes).toEqual([]);
    expect(stack.getState().mounted[0]?.title_id).toBe(1);
  });
});

describe('super likes', () => {
  it('spend at once: the badge drops with the queued vote', async () => {
    const { answerer } = await setup({ superLeft: 2 });
    expect(answerer.superLikesLeft()).toBe(2);
    answerer.answer('super_like');
    expect(answerer.superLikesLeft()).toBe(1);
    answerer.answer('super_like');
    expect(answerer.superLikesLeft()).toBe(0);
  });

  it('refuse a third without a word, and the card stays', async () => {
    const { answerer, votes, stack } = await setup({ superLeft: 0 });
    expect(answerer.answer('super_like')).toBeNull();
    expect(votes).toEqual([]);
    expect(stack.getState().mounted[0]?.title_id).toBe(1);
  });

  it('come back to the badge when the server says there were none', async () => {
    const { answerer } = await setup({ superLeft: 1 });
    answerer.answer('super_like');
    expect(answerer.superLikesLeft()).toBe(0);
    answerer.giveBackSuperLike();
    expect(answerer.superLikesLeft()).toBe(1);
  });

  it('are not spent by other answers', async () => {
    const { answerer } = await setup({ superLeft: 2 });
    answerer.answer('like');
    answerer.answer('seen');
    expect(answerer.superLikesLeft()).toBe(2);
  });
});

describe('presence count', () => {
  it('is reported at 5, 10 and 15 answers, not in between', async () => {
    const { answerer, counts } = await setup();
    for (let i = 1; i <= 16; i++) {
      answerer.answer('like');
      if (i < PRESENCE_EVERY) expect(counts).toEqual([]);
      await new Promise((resolve) => setImmediate(resolve)); // the refill arrives
    }
    expect(counts).toEqual([5, 10, 15]);
  });

  it('drops by one with an undo, and says so when the last count sent is now too high', async () => {
    const { answerer, counts } = await setup();
    for (let i = 1; i <= 5; i++) {
      answerer.answer('like');
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(counts).toEqual([5]);
    answerer.undone();
    expect(answerer.count()).toBe(4);
    expect(counts).toEqual([5, 4]);
    // Another undo while the others already know less than that says nothing new... except the new count.
    answerer.undone();
    expect(counts).toEqual([5, 4, 3]);
  });

  it('says nothing for an undo when no count was sent yet', async () => {
    const { answerer, counts } = await setup();
    answerer.answer('like');
    answerer.undone();
    expect(answerer.count()).toBe(0);
    expect(counts).toEqual([]);
  });

  it('counts on from the seat the server already knows', async () => {
    const { stack } = await setup();
    const counts: number[] = [];
    const answerer = createAnswerer({
      stack,
      queue: { enqueue: () => undefined, pendingSuperLikes: () => 0 },
      roomId: ROOM,
      memberId: ME,
      initialSuperLikes: 2,
      initialCount: 3,
      locked: () => false,
      now: () => 0,
      onCount: (n) => void counts.push(n),
    });
    answerer.answer('like');
    expect(counts).toEqual([]);
    answerer.answer('like');
    expect(counts).toEqual([5]);
    expect(answerer.count()).toBe(5);
  });
});

describe('a solo room', () => {
  it('marks its votes so the queue keeps them without a kept room', async () => {
    const { stack } = await setup();
    const votes: { solo?: boolean }[] = [];
    const answerer = createAnswerer({
      stack,
      queue: { enqueue: (vote) => void votes.push(vote), pendingSuperLikes: () => 0 },
      roomId: ROOM,
      memberId: ME,
      solo: () => true,
      initialSuperLikes: 2,
      initialCount: 0,
      locked: () => false,
      now: () => 0,
      onCount: () => undefined,
    });
    answerer.answer('like');
    expect(votes[0]?.solo).toBe(true);
  });

  it("leaves a group room's votes unmarked", async () => {
    const { votes, answerer } = await setup();
    answerer.answer('like');
    expect(votes[0]).not.toHaveProperty('solo');
  });
});

describe('the rewatch question', () => {
  it.each([
    ['allow_rewatch', true],
    ['show_all', true],
    ['hide_seen', false],
    [undefined, false],
  ] as const)('%s asks: %s', (rule, asks) => {
    expect(asksRewatch(rule)).toBe(asks);
  });

  it.each([
    ['seen', 'allow_rewatch', true],
    ['seen', 'show_all', true],
    ['seen', 'hide_seen', false],
    ['seen', undefined, false],
    ['nope', 'allow_rewatch', false],
    ['like', 'show_all', false],
    ['seen_rewatch', 'allow_rewatch', false],
  ] as const)('%s under %s offers the chip: %s', (kind, rule, offered) => {
    expect(offersRewatch(kind, rule)).toBe(offered);
  });

  it('a Seen it is a plain seen at once: the card goes, nothing waits for a second tap', async () => {
    const { answerer, votes, stack, tick } = await setup();
    tick(4_000);
    answerer.answer('seen');
    expect(votes.map((v) => [v.answer, v.dwell_ms])).toEqual([['seen', 4_000]]);
    expect(stack.getState().mounted[0]?.title_id).toBe(2);
  });

  it('two fast Seen its send two seen votes and never a rewatch', async () => {
    const { answerer, votes } = await setup();
    answerer.answer('seen');
    answerer.answer('seen');
    expect(votes.map((v) => [v.title_id, v.answer])).toEqual([
      [1, 'seen'],
      [2, 'seen'],
    ]);
  });

  it('changes the last answer to a rewatch with the same card, dwell and flip, and counts nothing', async () => {
    const { answerer, votes, tick, counts } = await setup();
    tick(3_000);
    answerer.answer('seen');
    tick(500);
    expect(answerer.change(1, 'seen_rewatch')).toBe(true);
    expect(votes).toHaveLength(2);
    expect(votes[1]).toMatchObject({
      title_id: 1,
      answer: 'seen_rewatch',
      dwell_ms: 3_000,
      flipped: false,
    });
    expect(votes[1]!.client_at).not.toBe(votes[0]!.client_at);
    expect(answerer.count()).toBe(1);
    expect(counts).toEqual([]);
  });

  it('refuses to change an answer that is not the last, or once the room moved on', async () => {
    const t = await setup();
    expect(t.answerer.change(1, 'seen_rewatch')).toBe(false);
    t.answerer.answer('seen');
    t.answerer.answer('nope');
    expect(t.answerer.change(1, 'seen_rewatch')).toBe(false);
    t.state.locked = true;
    expect(t.answerer.change(2, 'seen_rewatch')).toBe(false);
    expect(t.votes.map((v) => v.answer)).toEqual(['seen', 'nope']);
  });

  it('does not spend a super like on either answer', async () => {
    const { answerer } = await setup({ superLeft: 2 });
    answerer.answer('seen_rewatch');
    answerer.answer('seen');
    expect(answerer.superLikesLeft()).toBe(2);
  });
});

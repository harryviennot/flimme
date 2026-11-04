import type { NextCard } from '@flimme/contract';

import { createCardStack } from './card-stack';
import { createUndoer } from './undo';
import type { QueuedVote } from './vote-queue';

// The undo path: what a tap on Undo does to the stack and the vote queue, without rendering.

const ROOM = 'room-1';

const card = (id: number) => ({ title_id: id, title: `Film ${id}`, poster_path: null }) as NextCard;
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(opts: { waiting?: boolean; locked?: boolean } = {}) {
  const stack = createCardStack(
    {
      fetchCards: () => Promise.resolve([1, 2, 3, 4, 5].map(card)),
      requestCards: () => Promise.resolve('queued'),
      prefetch: () => undefined,
      isAnswered: () => false,
      now: () => 0,
    },
    { screenWidth: 390 },
  );
  stack.getState().start();
  await flush();
  const state = { waiting: opts.waiting ?? false, locked: opts.locked ?? false };
  const queue = {
    removeLast: jest.fn((_room: string, titleId?: number) =>
      state.waiting ? ({ title_id: titleId } as QueuedVote) : null,
    ),
    enqueueUndo: jest.fn(),
  };
  const undoer = createUndoer({
    stack,
    queue,
    roomId: ROOM,
    memberId: 'm1',
    locked: () => state.locked,
  });
  const answer = (kind: 'like' | 'nope' | 'super_like' | 'seen' = 'like') => {
    const done = stack.getState().answer()!;
    undoer.record(done.card, kind);
    return done;
  };
  return { stack, queue, undoer, answer, state };
}

describe('undo', () => {
  it('is not possible before the first answer', async () => {
    const t = await setup();
    expect(t.undoer.state.getState().last).toBeNull();
    expect(t.undoer.undo()).toBeNull();
  });

  it('removes a vote that is still waiting and calls nothing', async () => {
    const t = await setup({ waiting: true });
    t.answer();
    expect(t.undoer.undo()?.card.title_id).toBe(1);
    expect(t.queue.removeLast).toHaveBeenCalledWith(ROOM, 1);
    expect(t.queue.enqueueUndo).not.toHaveBeenCalled();
  });

  it('queues one undo behind a vote that was sent', async () => {
    const t = await setup({ waiting: false });
    t.answer();
    t.undoer.undo();
    expect(t.queue.enqueueUndo).toHaveBeenCalledTimes(1);
    expect(t.queue.enqueueUndo).toHaveBeenCalledWith({
      room_id: ROOM,
      member_id: 'm1',
      title_id: 1,
    });
  });

  it.each([true, false])(
    'puts the card on top at once, front side up (waiting: %s)',
    async (waiting) => {
      const t = await setup({ waiting });
      t.answer();
      t.stack.getState().setFlipped(true);
      t.undoer.undo();
      expect(t.stack.getState().mounted[0]?.title_id).toBe(1);
      expect(t.stack.getState().flipped).toBe(false);
    },
  );

  it('is once in a row, and wakes again with the next answer', async () => {
    const t = await setup();
    t.answer();
    expect(t.undoer.undo()).not.toBeNull();
    expect(t.undoer.state.getState().last).toBeNull();
    expect(t.undoer.undo()).toBeNull();
    expect(t.queue.enqueueUndo).toHaveBeenCalledTimes(1);
    t.answer('nope');
    expect(t.undoer.state.getState().last).not.toBeNull();
    expect(t.undoer.undo()?.kind).toBe('nope');
  });

  it.each(['like', 'nope', 'super_like', 'seen', 'seen_rewatch'] as const)(
    'brings back a card answered %s, saying which answer it was',
    async (kind) => {
      const t = await setup();
      const done = t.answer('like');
      t.undoer.record(done.card, kind);
      expect(t.undoer.undo()?.kind).toBe(kind);
      expect(t.stack.getState().mounted[0]?.title_id).toBe(1);
    },
  );

  it('does nothing once the room moved on', async () => {
    const t = await setup({ locked: true });
    t.answer();
    expect(t.undoer.undo()).toBeNull();
    expect(t.queue.enqueueUndo).not.toHaveBeenCalled();
    expect(t.stack.getState().mounted[0]?.title_id).toBe(2);
  });
});

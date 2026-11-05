import type { NextCard } from '@flimme/contract';

import { createSoloSession, likesOf, CHECKPOINT_EVERY } from './session';

const card = (id: number) => ({ title_id: id, title: `Film ${id}` }) as NextCard;

function play(session: ReturnType<typeof createSoloSession>, from: number, to: number) {
  for (let id = from; id <= to; id++) session.getState().answer(card(id), 'nope');
}

describe('the solo session', () => {
  it('orders likes: super likes first, then newest first, nopes left out', () => {
    const s = createSoloSession();
    s.getState().answer(card(1), 'like');
    s.getState().answer(card(2), 'nope');
    s.getState().answer(card(3), 'super_like');
    s.getState().answer(card(4), 'like');
    s.getState().answer(card(5), 'super_like');
    expect(likesOf(s.getState().entries).map((e) => e.card.title_id)).toEqual([5, 3, 4, 1]);
  });

  it('opens the checkpoint after the 20th and the 40th answer, once each', () => {
    const s = createSoloSession();
    play(s, 1, CHECKPOINT_EVERY - 1);
    expect(s.getState().open).toBeNull();
    play(s, 20, 20);
    expect(s.getState().open).toBe(20);
    s.getState().dismiss();
    expect(s.getState().open).toBeNull();
    play(s, 21, 40);
    expect(s.getState().open).toBe(40);
  });

  it('does not show a multiple twice after an undo and a new answer', () => {
    const s = createSoloSession();
    play(s, 1, 20);
    expect(s.getState().open).toBe(20);
    s.getState().undo(20);
    expect(s.getState().open).toBeNull();
    expect(s.getState().entries).toHaveLength(19);
    s.getState().answer(card(21), 'like');
    expect(s.getState().open).toBeNull();
  });

  it('counts a like given again after an undo once', () => {
    const s = createSoloSession();
    s.getState().answer(card(1), 'like');
    s.getState().undo(1);
    s.getState().answer(card(1), 'like');
    expect(likesOf(s.getState().entries)).toHaveLength(1);
  });
});

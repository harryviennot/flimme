import type { Card, NextCard } from '@flimme/contract';
import { act, renderHook } from '@testing-library/react-native';

import { setSynopsisCard, synopsisCardOf, useSynopsisCard } from './synopsis';

const card = { title_id: 7, title: 'Paddington 2' } as NextCard;

afterEach(() => setSynopsisCard(null));

describe('the synopsis sheet card', () => {
  it('hands the card over by title id', () => {
    setSynopsisCard(card);
    expect(synopsisCardOf(7)).toBe(card);
    expect(synopsisCardOf(8)).toBeNull();
  });

  it('is empty when nothing was handed over', () => {
    expect(synopsisCardOf(7)).toBeNull();
  });

  it('tells a mounted sheet when the card goes, so it can close', async () => {
    setSynopsisCard(card);
    const { result } = await renderHook(() => useSynopsisCard(7));
    expect(result.current).toBe(card);
    await act(async () => setSynopsisCard(null));
    expect(result.current).toBeNull();
  });
});

describe('a finalist card', () => {
  it('is a plain Card, with none of the swipe card extras', () => {
    const plain = { title_id: 9, title: 'Finalist' } as Card;
    setSynopsisCard(plain);
    expect(synopsisCardOf(9)).toBe(plain);
  });
});

import type { Card, RoomRound } from '@flimme/contract';

import { cardsKey, finalistViews, openRound } from './rounds';

const round = (seq: number, stage: RoomRound['stage']) =>
  ({ id: `r${seq}`, seq, stage }) as RoomRound;

describe('the open round', () => {
  it('is the latest round that has not closed', () => {
    expect(openRound([round(1, 'closed'), round(2, 'vote')])?.id).toBe('r2');
    expect(openRound([round(1, 'closed')])).toBeNull();
    expect(openRound([])).toBeNull();
    expect(openRound(undefined)).toBeNull();
  });
});

describe('the finalists', () => {
  const card = (id: number, poster: string | null): Card =>
    ({
      title_id: id,
      title: `Film ${id}`,
      year: 2020,
      poster_path: poster,
      poster_placeholder: 'hash',
    }) as Card;

  it('keeps seed order and tolerates cards that have not arrived', () => {
    const views = finalistViews([3, 1, 2], [card(1, '/a.jpg'), card(2, null)], 'https://img', 400);
    expect(views.map((v) => v.titleId)).toEqual([3, 1, 2]);
    expect(views[0]).toMatchObject({ title: null, poster: null, noPoster: false });
    expect(views[1]).toMatchObject({ title: 'Film 1', poster: { uri: 'https://img/w500/a.jpg' } });
    expect(views[2]).toMatchObject({ noPoster: true, poster: null });
  });

  it('lets the info button show only for a card with a title and an overview', () => {
    const withText = { ...card(1, null), overview: 'About' };
    const noText = { ...card(2, null), overview: null };
    const views = finalistViews([1, 2, 3], [withText, noText], undefined, 400);
    expect(views.map((v) => v.hasSynopsis)).toEqual([true, false, false]);
  });

  it('keys the cards read by the set of films', () => {
    expect(cardsKey([3, 1, 2])).toBe('1,2,3');
  });
});

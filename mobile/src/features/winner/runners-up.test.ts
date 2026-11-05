import type { Card, RunnersUpResult } from '@flimme/contract';

import { buildRunnersUp, MAX_FACES, runnerUpDetail } from './runners-up';

const card = (id: number): Card =>
  ({ title_id: id, title: `Film ${id}`, poster_path: null, poster_placeholder: null }) as Card;

const liker = (n: number, name = `P${n}`) => ({
  member_id: `m${n}`,
  display_name: name,
  avatar_key: 'teal',
});

type Entries = Extract<RunnersUpResult, { status: 'ok' }>['runners_up'];

const party = (runners: Entries): RunnersUpResult => ({
  status: 'ok',
  reveal: 'party',
  source: 'finalists',
  runners_up: runners,
});

describe('buildRunnersUp', () => {
  it('keeps the read order and each liker in the order given (Party)', () => {
    const data = buildRunnersUp(
      party([
        { title_id: 2, likes: 2, likers: [liker(2, 'Zoé'), liker(1, 'Ana')] },
        { title_id: 1, likes: 1, likers: [liker(3, 'Bo')] },
      ]),
      [card(1), card(2)],
    );
    expect(data?.source).toBe('finalists');
    expect(data?.items.map((i) => i.card.title_id)).toEqual([2, 1]);
    expect(data?.items[0]?.likers?.map((l) => l.name)).toEqual(['Zoé', 'Ana']);
  });

  it('gives Blind a count and no likers, even if likers came with it', () => {
    const data = buildRunnersUp(
      {
        status: 'ok',
        reveal: 'blind',
        source: 'most_liked',
        runners_up: [{ title_id: 1, likes: 3, likers: [liker(1)] }],
      },
      [card(1)],
    );
    expect(data?.items[0]?.likes).toBe(3);
    expect(data?.items[0]?.likers).toBeNull();
  });

  it('gives Party no count', () => {
    const data = buildRunnersUp(party([{ title_id: 1, likes: 4, likers: [liker(1)] }]), [card(1)]);
    expect(data?.items[0]?.likes).toBeNull();
  });

  it('shows nothing under a runner-up with no likes', () => {
    const blind = buildRunnersUp(
      {
        status: 'ok',
        reveal: 'blind',
        source: 'finalists',
        runners_up: [{ title_id: 1, likes: 0 }],
      },
      [card(1)],
    );
    expect(blind?.items[0]).toMatchObject({ likes: null, likers: null });
    const p = buildRunnersUp(party([{ title_id: 1, likes: 0, likers: [] }]), [card(1)]);
    expect(p?.items[0]).toMatchObject({ likes: null, likers: null });
  });

  it('leaves out a film whose card is missing, and the section if none is left', () => {
    const answer = party([
      { title_id: 1, likes: 1, likers: [liker(1)] },
      { title_id: 2, likes: 1, likers: [liker(2)] },
    ]);
    expect(buildRunnersUp(answer, [card(2)])?.items.map((i) => i.card.title_id)).toEqual([2]);
    expect(buildRunnersUp(answer, [])).toBeNull();
  });

  it.each([
    ['no answer', undefined],
    ['not finished', { status: 'not_finished' } as RunnersUpResult],
    [
      'no source',
      { status: 'ok', reveal: 'party', source: null, runners_up: [] } as RunnersUpResult,
    ],
    ['an empty list', party([])],
  ])('shows no section for %s', (_name, answer) => {
    expect(buildRunnersUp(answer, [card(1)])).toBeNull();
  });
});

describe('runnerUpDetail', () => {
  it('names every liker, past the faces shown', () => {
    const likers = [1, 2, 3, 4, 5].map((n) => ({
      memberId: `m${n}`,
      name: `P${n}`,
      color: 'teal' as const,
    }));
    expect(MAX_FACES).toBe(3);
    expect(runnerUpDetail({ likers, likes: null }, 'en')).toEqual({
      kind: 'likedBy',
      names: 'P1, P2, P3, P4, and P5',
    });
  });
  it('is the count in Blind, nothing without likes', () => {
    expect(runnerUpDetail({ likers: null, likes: 3 }, 'en')).toEqual({ kind: 'likes', count: 3 });
    expect(runnerUpDetail({ likers: null, likes: null }, 'en')).toBeNull();
  });
});

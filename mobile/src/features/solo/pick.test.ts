import { markJustPicked, pickFilm, takeJustPicked, type PickDeps } from './pick';

function deps(over: Partial<PickDeps> = {}): PickDeps {
  return {
    flush: jest.fn().mockResolvedValue(undefined),
    waitingVotes: jest.fn(() => 0),
    soloPick: jest.fn().mockResolvedValue({ status: 'ok', title_id: 7 }),
    ...over,
  };
}

describe('pickFilm', () => {
  it('flushes the votes before it picks', async () => {
    const order: string[] = [];
    const d = deps({
      flush: jest.fn(async () => void order.push('flush')),
      soloPick: jest.fn(async () => {
        order.push('pick');
        return { status: 'ok' as const, title_id: 7 };
      }),
    });
    expect(await pickFilm('r', 7, d)).toEqual({ kind: 'picked', titleId: 7 });
    expect(order).toEqual(['flush', 'pick']);
  });

  it('does not pick while a vote still waits (offline)', async () => {
    const d = deps({ waitingVotes: jest.fn(() => 2) });
    expect(await pickFilm('r', 7, d)).toEqual({ kind: 'failed' });
    expect(d.soloPick).not.toHaveBeenCalled();
  });

  it('turns each answer into an outcome', async () => {
    const answer = (value: unknown) => deps({ soloPick: jest.fn().mockResolvedValue(value) });
    expect(await pickFilm('r', 7, answer({ status: 'not_liked' }))).toEqual({ kind: 'not_liked' });
    expect(await pickFilm('r', 7, answer({ status: 'closed', state: 'done' }))).toEqual({
      kind: 'closed',
      state: 'done',
    });
    expect(
      await pickFilm('r', 7, deps({ soloPick: jest.fn().mockRejectedValue(new Error('x')) })),
    ).toEqual({ kind: 'failed' });
  });
});

describe('the landing', () => {
  it('plays once after a pick made on this phone, never on a cold start', () => {
    expect(takeJustPicked('r')).toBe(false);
    markJustPicked('r');
    expect(takeJustPicked('r')).toBe(true);
    expect(takeJustPicked('r')).toBe(false);
  });
});

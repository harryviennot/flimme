import { saveServices } from './save-services';

const input = { roomId: 'r1', selection: [8, 119], start: [8] };
const ok = { status: 'ok' as const };

function deps(overrides: Partial<Parameters<typeof saveServices>[1]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      setMyProviders: jest.fn(async () => {
        calls.push('profile');
        return ok;
      }),
      setSeatPrefs: jest.fn(async () => {
        calls.push('seat');
        return ok;
      }),
      ...overrides,
    },
  };
}

describe('saveServices', () => {
  it('makes no call when the selection did not change, in any order', async () => {
    const { deps: d, calls } = deps();
    await expect(
      saveServices({ roomId: 'r1', selection: [119, 8], start: [8, 119] }, d),
    ).resolves.toEqual({ kind: 'close' });
    expect(calls).toEqual([]);
  });

  it('saves the profile before the seat, then closes', async () => {
    const { deps: d, calls } = deps();
    await expect(saveServices(input, d)).resolves.toEqual({ kind: 'close' });
    expect(calls).toEqual(['profile', 'seat']);
    expect(d.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', provider_ids: [8, 119] });
  });

  it('treats too_many from either call as a bug and stops', async () => {
    const first = deps({
      setMyProviders: jest.fn(async () => ({ status: 'too_many' as const, max: 5 })),
    });
    await expect(saveServices(input, first.deps)).resolves.toMatchObject({ kind: 'bug' });
    expect(first.deps.setSeatPrefs).not.toHaveBeenCalled();
    const second = deps({
      setSeatPrefs: jest.fn(async () => ({
        status: 'too_many' as const,
        field: 'provider_ids' as const,
        max: 5,
      })),
    });
    await expect(saveServices(input, second.deps)).resolves.toMatchObject({ kind: 'bug' });
  });

  it('closes when the game started meanwhile', async () => {
    const { deps: d } = deps({
      setSeatPrefs: jest.fn(async () => ({ status: 'closed' as const })),
    });
    await expect(saveServices(input, d)).resolves.toEqual({ kind: 'close' });
  });

  it('says failed when a call throws', async () => {
    const { deps: d } = deps({
      setMyProviders: jest.fn(async () => {
        throw new Error('x');
      }),
    });
    await expect(saveServices(input, d)).resolves.toEqual({ kind: 'failed' });
  });
});

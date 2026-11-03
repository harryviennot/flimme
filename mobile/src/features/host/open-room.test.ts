import { openRoom, type OpenRoomDeps } from './open-room';

const defaults = { runtime_max: null, max_age: null };

function deps(overrides: Partial<OpenRoomDeps> = {}): OpenRoomDeps {
  return {
    setMyProviders: jest.fn(async () => ({ status: 'ok' as const })),
    createRoom: jest.fn(async () => ({ status: 'ok' as const, room_id: 'r1', code: '123456' })),
    ...overrides,
  };
}

describe('openRoom', () => {
  it('creates a quick match with both settings keys, and skips the save when nothing changed', async () => {
    const d = deps();
    const outcome = await openRoom({ selection: [8], changed: false, settings: defaults }, d);
    expect(outcome).toEqual({ kind: 'opened', roomId: 'r1' });
    expect(d.setMyProviders).not.toHaveBeenCalled();
    expect(d.createRoom).toHaveBeenCalledWith({
      mode: 'quick_match',
      settings: { runtime_max: null, max_age: null },
    });
  });

  it('sends the chosen settings', async () => {
    const d = deps();
    await openRoom(
      { selection: [8], changed: false, settings: { runtime_max: 105, max_age: 12 } },
      d,
    );
    expect(d.createRoom).toHaveBeenCalledWith({
      mode: 'quick_match',
      settings: { runtime_max: 105, max_age: 12 },
    });
  });

  it('saves the services before creating the room when they changed', async () => {
    const order: string[] = [];
    const d = deps({
      setMyProviders: jest.fn(async () => {
        order.push('save');
        return { status: 'ok' as const };
      }),
      createRoom: jest.fn(async () => {
        order.push('create');
        return { status: 'ok' as const, room_id: 'r1', code: '123456' };
      }),
    });
    await openRoom({ selection: [8, 119], changed: true, settings: defaults }, d);
    expect(order).toEqual(['save', 'create']);
    expect(d.setMyProviders).toHaveBeenCalledWith({ provider_ids: [8, 119] });
  });

  it('makes no room when the save throws', async () => {
    const d = deps({
      setMyProviders: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await openRoom({ selection: [8], changed: true, settings: defaults }, d)).toEqual({
      kind: 'network',
    });
    expect(d.createRoom).not.toHaveBeenCalled();
  });

  it('makes no room when the save answers too_many', async () => {
    const d = deps({
      setMyProviders: jest.fn(async () => ({ status: 'too_many' as const, max: 50 })),
    });
    const outcome = await openRoom({ selection: [8], changed: true, settings: defaults }, d);
    expect(outcome.kind).toBe('bug');
    expect(d.createRoom).not.toHaveBeenCalled();
  });

  it('walks every create_room answer', async () => {
    const answers = [
      [{ status: 'name_required' as const }, { kind: 'name_required' }],
      [{ status: 'country_required' as const }, { kind: 'unsupported' }],
      [{ status: 'unknown_mode' as const }, { kind: 'bug', reason: 'create_room:unknown_mode' }],
      [
        { status: 'invalid_settings' as const, field: 'max_age' },
        { kind: 'bug', reason: 'create_room:invalid_settings' },
      ],
    ] as const;
    for (const [answer, expected] of answers) {
      const d = deps({ createRoom: jest.fn(async () => answer) });
      expect(await openRoom({ selection: [8], changed: false, settings: defaults }, d)).toEqual(
        expected,
      );
    }
  });

  it('turns a thrown create_room into a network outcome', async () => {
    const d = deps({
      createRoom: jest.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await openRoom({ selection: [8], changed: false, settings: defaults }, d)).toEqual({
      kind: 'network',
    });
  });
});

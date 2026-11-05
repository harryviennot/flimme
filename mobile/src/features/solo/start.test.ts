import type { StartSoloResult } from '@flimme/contract';

import { startSoloGame } from './start';

const input = { selection: [8], changed: true, settings: { runtime_max: null, max_age: null } };

function deps(answer: StartSoloResult | Error) {
  return {
    setMyProviders: jest.fn().mockResolvedValue({ status: 'ok' }),
    startSolo: jest.fn(() =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
    ),
  };
}

describe('startSoloGame', () => {
  it.each([
    [
      { status: 'ok', room_id: 'r', member_id: 'm', state: 'swiping' },
      { kind: 'started', roomId: 'r', dealing: false },
    ],
    [
      { status: 'dealing', room_id: 'r', member_id: 'm' },
      { kind: 'started', roomId: 'r', dealing: true },
    ],
    [
      { status: 'too_few_films', eligible: 3 },
      { kind: 'too_few', eligible: 3 },
    ],
    [{ status: 'daily_limit' }, { kind: 'cap' }],
    [{ status: 'name_required' }, { kind: 'name_required' }],
    [{ status: 'country_required' }, { kind: 'unsupported' }],
    [{ status: 'rate_limited' }, { kind: 'rate_limited' }],
    [
      { status: 'invalid_settings', field: 'x' },
      { kind: 'bug', reason: 'start_solo:invalid_settings' },
    ],
  ] as [StartSoloResult, unknown][])('%j leads to %j', async (answer, outcome) => {
    expect(await startSoloGame(input, deps(answer))).toEqual(outcome);
  });

  it('saves the services first, only when they changed, and stops on a refusal', async () => {
    const d = deps({ status: 'daily_limit' });
    await startSoloGame({ ...input, changed: false }, d);
    expect(d.setMyProviders).not.toHaveBeenCalled();
    const refused = deps({ status: 'daily_limit' });
    refused.setMyProviders.mockResolvedValue({ status: 'unknown_provider' });
    expect((await startSoloGame(input, refused)).kind).toBe('bug');
    expect(refused.startSolo).not.toHaveBeenCalled();
  });

  it('says network when a call throws', async () => {
    expect(await startSoloGame(input, deps(new Error('x')))).toEqual({ kind: 'network' });
  });
});

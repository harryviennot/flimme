import { ApiError, REPORT_MEMBER_ANSWERS } from '@flimme/contract';

import { REPORT_OUTCOMES, runReport } from './report';

const args = { roomId: 'r1', memberId: 'm2', reason: 'spam' as const };

describe('runReport', () => {
  it('has a behaviour for every answer of report_member', async () => {
    for (const status of REPORT_MEMBER_ANSWERS) {
      expect(REPORT_OUTCOMES[status]).toBeDefined();
      const call = jest.fn(async () => ({ status }));
      await expect(runReport(call, args)).resolves.toEqual(REPORT_OUTCOMES[status]);
    }
  });

  it.each([
    ['ok', 'sent'],
    ['rate_limited', 'rate_limited'],
    ['not_in_room', 'not_in_room'],
  ] as const)('turns %s into %s', async (status, kind) => {
    const call = jest.fn(async () => ({ status }));
    await expect(runReport(call, args)).resolves.toEqual({ kind });
  });

  it('sends the room, the seat and the reason, once', async () => {
    const call = jest.fn(async () => ({ status: 'ok' as const }));
    await runReport(call, args);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith({ room_id: 'r1', member_id: 'm2', reason: 'spam' });
  });

  it('turns a failed call into "failed", network or not', async () => {
    for (const kind of ['network', 'unexpected'] as const) {
      const call = jest.fn(async () => {
        throw new ApiError(kind, 'report_member', 'boom');
      });
      await expect(runReport(call, args)).resolves.toEqual({ kind: 'failed' });
    }
  });
});

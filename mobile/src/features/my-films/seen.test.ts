import { changeSeen } from './seen';

describe('changeSeen', () => {
  it('sends the new value and answers ok', async () => {
    const set = jest.fn(async () => ({ status: 'ok' as const }));
    await expect(changeSeen(7, true, set)).resolves.toBe('ok');
    await expect(changeSeen(7, false, set)).resolves.toBe('ok');
    expect(set).toHaveBeenNthCalledWith(1, { title_id: 7, seen: true });
    expect(set).toHaveBeenNthCalledWith(2, { title_id: 7, seen: false });
  });

  it('passes not_found on', async () => {
    await expect(changeSeen(7, true, async () => ({ status: 'not_found' }))).resolves.toBe(
      'not_found',
    );
  });

  it('is failed on a rate limit or a thrown error', async () => {
    await expect(changeSeen(7, true, async () => ({ status: 'rate_limited' }))).resolves.toBe(
      'failed',
    );
    await expect(
      changeSeen(7, true, async () => {
        throw new Error('offline');
      }),
    ).resolves.toBe('failed');
  });
});

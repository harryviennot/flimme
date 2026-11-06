import { changeSaved } from './saved';

describe('changeSaved', () => {
  it('sends the new value and answers ok', async () => {
    const set = jest.fn(async () => ({ status: 'ok' as const }));
    await expect(changeSaved(7, false, set)).resolves.toBe('ok');
    await expect(changeSaved(7, true, set)).resolves.toBe('ok');
    expect(set).toHaveBeenNthCalledWith(1, { title_id: 7, saved: false });
    expect(set).toHaveBeenNthCalledWith(2, { title_id: 7, saved: true });
  });

  it('passes not_found on', async () => {
    await expect(changeSaved(7, false, async () => ({ status: 'not_found' }))).resolves.toBe(
      'not_found',
    );
  });

  it('is failed on a rate limit or a thrown error', async () => {
    await expect(changeSaved(7, false, async () => ({ status: 'rate_limited' }))).resolves.toBe(
      'failed',
    );
    await expect(
      changeSaved(7, false, async () => {
        throw new Error('offline');
      }),
    ).resolves.toBe('failed');
  });
});

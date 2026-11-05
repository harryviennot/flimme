import { runRecapShare, type RecapShareDeps } from './share';

function deps(overrides: Partial<RecapShareDeps> = {}): RecapShareDeps {
  return {
    waitForPoster: jest.fn().mockResolvedValue(undefined),
    capture: jest.fn().mockResolvedValue('file:///cache/recap.png'),
    share: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn(),
    onShared: jest.fn(),
    ...overrides,
  };
}

describe('sharing the recap (recap.md#sharing)', () => {
  it('waits for the poster, captures, opens the share sheet, cleans up, then tracks once', async () => {
    const order: string[] = [];
    const d = deps({
      waitForPoster: jest.fn(async () => void order.push('poster')),
      capture: jest.fn(async () => {
        order.push('capture');
        return 'file:///cache/recap.png';
      }),
      share: jest.fn(async () => void order.push('share')),
      deleteFile: jest.fn(() => void order.push('delete')),
      onShared: jest.fn(() => void order.push('track')),
    });
    await expect(runRecapShare(d)).resolves.toBe('shared');
    expect(order).toEqual(['poster', 'capture', 'share', 'delete', 'track']);
    expect(d.share).toHaveBeenCalledWith('file:///cache/recap.png');
    expect(d.onShared).toHaveBeenCalledTimes(1);
  });

  it('reports a failed capture and shares nothing', async () => {
    const d = deps({ capture: jest.fn().mockRejectedValue(new Error('blank')) });
    await expect(runRecapShare(d)).resolves.toBe('capture_failed');
    expect(d.share).not.toHaveBeenCalled();
    expect(d.onShared).not.toHaveBeenCalled();
  });

  it('reports a failed share, tracks nothing and still deletes the file', async () => {
    const d = deps({ share: jest.fn().mockRejectedValue(new Error('no sheet')) });
    await expect(runRecapShare(d)).resolves.toBe('share_failed');
    expect(d.onShared).not.toHaveBeenCalled();
    expect(d.deleteFile).toHaveBeenCalledWith('file:///cache/recap.png');
  });

  it('never fails because the cleanup failed', async () => {
    const d = deps({
      deleteFile: jest.fn(() => {
        throw new Error('gone');
      }),
    });
    await expect(runRecapShare(d)).resolves.toBe('shared');
  });
});

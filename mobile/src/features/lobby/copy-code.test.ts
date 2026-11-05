import { track } from '@/lib/analytics';

import { copyRoomCode } from './copy-code';

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

const deps = () => ({
  copy: jest.fn(async (_text: string) => true),
  toast: jest.fn(),
  haptic: jest.fn(),
});

describe('copyRoomCode', () => {
  it('copies the bare six digits, buzzes once and shows the success toast', async () => {
    const d = deps();
    await copyRoomCode('482913', 'Code copied', d);
    expect(d.copy).toHaveBeenCalledWith('482913');
    expect(d.haptic).toHaveBeenCalledTimes(1);
    expect(d.toast).toHaveBeenCalledWith({ tone: 'success', title: 'Code copied' });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('room:invite_share', { method: 'code_copy' });
  });

  it('claims nothing when the clipboard refuses', async () => {
    const d = deps();
    d.copy.mockRejectedValueOnce(new Error('no clipboard'));
    await copyRoomCode('482913', 'Code copied', d);
    expect(d.toast).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});

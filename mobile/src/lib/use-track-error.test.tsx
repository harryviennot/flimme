import { renderHook } from '@testing-library/react-native';

import { track } from './analytics';
import { useTrackErrorView } from './use-track-error';

let mockSegments: string[] = [];
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));
jest.mock('./analytics', () => ({ track: jest.fn() }));

type Code = Parameters<typeof useTrackErrorView>[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments = ['room', '[id]', 'lobby'];
});

describe('error:view', () => {
  it.each(['room_closed', 'update_required', 'unexpected', 'offline', 'reconnecting'] as const)(
    'is sent once for %s, with the route pattern',
    async (code) => {
      const view = await renderHook(() => useTrackErrorView(code));
      await view.rerender({});
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith('error:view', { code, screen: '/room/[id]/lobby' });
    },
  );

  it('is sent again for a different code, and never for none', async () => {
    const view = await renderHook((code: Code) => useTrackErrorView(code), {
      initialProps: null as Code,
    });
    expect(track).not.toHaveBeenCalled();
    await view.rerender('offline');
    await view.rerender('reconnecting');
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('never carries a path with a code or an id', async () => {
    mockSegments = ['join', '482913'];
    await renderHook(() => useTrackErrorView('unexpected'));
    expect(track).toHaveBeenCalledWith('error:view', { code: 'unexpected', screen: '/' });
  });
});

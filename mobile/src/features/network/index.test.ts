import { onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { isOnline, useOnline, watchNetwork } from '.';

type Listener = (state: { isConnected?: boolean; isInternetReachable?: boolean }) => void;

let mockListener: Listener | undefined;
const mockRemove = jest.fn();
const mockGetState = jest.fn();

jest.mock('expo-network', () => ({
  addNetworkStateListener: (fn: Listener) => {
    mockListener = fn;
    return { remove: mockRemove };
  },
  getNetworkStateAsync: () => mockGetState(),
}));

beforeEach(() => {
  mockListener = undefined;
  mockRemove.mockReset();
  mockGetState.mockReset().mockResolvedValue({ isConnected: true, isInternetReachable: true });
  onlineManager.setOnline(true);
});

describe('isOnline', () => {
  it('is online unless the system says otherwise', () => {
    expect(isOnline({})).toBe(true);
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(isOnline({ isConnected: false })).toBe(false);
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
});

describe('useOnline', () => {
  it('follows the network state and tells TanStack', async () => {
    const { result } = await renderHook(() => useOnline());
    const subscription = watchNetwork();
    await act(async () => {
      mockListener?.({ isConnected: false, isInternetReachable: false });
    });
    expect(result.current).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);

    await act(async () => {
      mockListener?.({ isConnected: true, isInternetReachable: true });
    });
    expect(result.current).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);

    subscription.remove();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('reads the state once at the start', async () => {
    mockGetState.mockResolvedValue({ isConnected: false });
    const { result } = await renderHook(() => useOnline());
    await act(async () => {
      watchNetwork();
    });
    expect(result.current).toBe(false);
  });

  it('keeps an event that arrives before the first reading', async () => {
    let resolve: (value: object) => void = () => {};
    mockGetState.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useOnline());
    await act(async () => {
      watchNetwork();
      mockListener?.({ isConnected: true, isInternetReachable: true });
      resolve({ isConnected: false });
    });
    expect(result.current).toBe(true);
  });
});

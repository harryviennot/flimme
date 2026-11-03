// Connectivity, from expo-network. One watcher (the root layout starts it) feeds the hook
// screens read and TanStack's `onlineManager`, so queries pause offline and resume by themselves.
import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { create } from 'zustand';

/** Online unless the system says there is no connection or no way out to the internet. */
export function isOnline(state: NetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

const useNetworkStore = create<{ online: boolean }>(() => ({ online: true }));

function apply(state: NetworkState) {
  const online = isOnline(state);
  useNetworkStore.setState({ online });
  onlineManager.setOnline(online);
}

/** Follows the device's connection until the returned subscription is removed. */
export function watchNetwork(): { remove: () => void } {
  let heard = false;
  const subscription = addNetworkStateListener((state) => {
    heard = true;
    apply(state);
  });
  getNetworkStateAsync()
    .then((state) => {
      // An event that arrived while this was pending is newer.
      if (!heard) apply(state);
    })
    .catch(() => {
      // Unknown means online: the requests themselves answer `network` when it isn't.
    });
  return subscription;
}

/** Whether the phone has a connection (true until the first reading says otherwise). */
export function useOnline(): boolean {
  return useNetworkStore((state) => state.online);
}

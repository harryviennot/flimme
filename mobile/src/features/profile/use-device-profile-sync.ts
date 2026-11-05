import { useDeviceSync } from './use-device-sync';
import { useMyProfile } from './use-my-profile';

/**
 * Keeps the profile in step with the device from the root layout, wherever the app is
 * (splash.md#what-happens-in-order, step 3). The splash can be gone before the profile read
 * ends (a cached profile sends the player straight on), so the sync cannot live in it.
 */
export function useDeviceProfileSync(enabled: boolean): void {
  const query = useMyProfile(enabled);
  useDeviceSync(query.data, query.dataUpdatedAt > 0 && !query.isError);
}

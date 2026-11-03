// The last profile read is kept on the device, so an offline launch still knows the player
// (splash.md#what-happens-in-order). A copy that no longer parses is ignored.
import { myProfileRow, type MyProfile } from '@flimme/contract';

import { storage, type KeyValueStore } from '@/lib/storage';

export const PROFILE_CACHE_KEY = 'flimme.my_profile';

export function saveCachedProfile(profile: MyProfile, kv: KeyValueStore = storage): void {
  try {
    kv.setItemSync(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // A full disk must not break the launch: the next read saves it again.
  }
}

export function readCachedProfile(kv: KeyValueStore = storage): MyProfile | null {
  try {
    const raw = kv.getItemSync(PROFILE_CACHE_KEY);
    if (raw === null) return null;
    const parsed = myProfileRow.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

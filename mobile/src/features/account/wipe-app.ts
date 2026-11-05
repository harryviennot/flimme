// The wipe wired to the app's real stores (see wipe.ts). A new persisted store joins the list.
import { keptRoomStore } from '@/features/room/kept-room';
import { matchShownStore } from '@/features/room/match-shown';
import { PROFILE_CACHE_KEY } from '@/features/profile/cache';
import { startSession } from '@/features/session';
import { useSettingsStore } from '@/features/settings';
import { useHintsStore } from '@/features/swipe/hints';
import { voteQueue } from '@/features/swipe';
import { forget as forgetAnalytics } from '@/lib/analytics';
import { queryClient } from '@/lib/query-client';
import { storage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { resetPersistedStore, wipeWith } from './wipe';

/** Signs out, forgets everything kept on the phone and starts as a new guest. */
export function wipeLocalData(): Promise<void> {
  return wipeWith({
    forgetAnalytics,
    signOut: async () => {
      // This phone only: the server already deleted the user, or has no use for the call.
      await supabase.auth.signOut({ scope: 'local' });
    },
    clearLocal: [
      () => voteQueue.clear(),
      () => resetPersistedStore(useSettingsStore as never),
      () => resetPersistedStore(keptRoomStore as never),
      () => resetPersistedStore(matchShownStore as never),
      () => resetPersistedStore(useHintsStore as never),
      () => storage.removeItemSync(PROFILE_CACHE_KEY),
    ],
    clearQueries: () => queryClient.clear(),
    startGuest: () => startSession(),
  });
}

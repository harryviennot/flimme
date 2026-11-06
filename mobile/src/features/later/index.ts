import { useEffect } from 'react';
import { AppState } from 'react-native';

import { api } from '@/api';
import { useOnline } from '@/features/network';
import { supabase } from '@/lib/supabase';

import { pendingSaves } from './pending';
import { savedSession } from './saved-session';
import { createSaveSettler } from './settle';

export { pendingSaves } from './pending';
export { savedSession, useIsSaved } from './saved-session';

/**
 * The app's one save settler. Saves for Later are kept on the device and sent in the background,
 * like a vote, so the bookmark works offline.
 */
export const saveSettler = createSaveSettler({
  store: pendingSaves,
  setFilmSaved: (args) => api.setFilmSaved(args),
  refreshSession: async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
  },
});

/** Saves or unsaves a film for this session and queues the call. Returns at once. */
export function setSaved(titleId: number, saved: boolean): void {
  savedSession.getState().set(titleId, saved);
  pendingSaves.getState().put(titleId, saved);
  void saveSettler.run();
}

/** The bookmark's tap: the opposite of what this session holds. Returns the new state. */
export function toggleSaved(titleId: number): boolean {
  const next = !savedSession.getState().has(titleId);
  setSaved(titleId, next);
  return next;
}

/** The sheet's own call went through: the session and the waiting list follow it. */
export function recordSaved(titleId: number, saved: boolean): void {
  savedSession.getState().set(titleId, saved);
  const waiting = pendingSaves.getState().items.find((i) => i.title_id === titleId);
  if (waiting) pendingSaves.getState().settle(waiting);
}

/** Sends what waited: on open, when the phone is back online and when the app comes to the foreground. */
export function useSettleSaves(): void {
  const online = useOnline();
  useEffect(() => {
    if (online && pendingSaves.getState().items.length > 0) void saveSettler.flush();
  }, [online]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && online && pendingSaves.getState().items.length > 0) {
        void saveSettler.flush();
      }
    });
    return () => subscription.remove();
  }, [online]);
}

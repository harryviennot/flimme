import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

import { startSessionWith, type SessionAnswer } from './start-session';

export type { SessionAnswer } from './start-session';

const useSessionStore = create<{ answer: SessionAnswer | null }>(() => ({ answer: null }));

let inFlight: Promise<SessionAnswer> | undefined;

/**
 * Finds the stored session or signs in as a guest. Calls made while one is running share
 * it; after an `offline` or `refused` answer, calling again tries again.
 */
export function startSession(): Promise<SessionAnswer> {
  inFlight ??= startSessionWith(supabase)
    .then((answer) => {
      useSessionStore.setState({ answer });
      return answer;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

/** The latest answer, or `null` while the first one is pending. */
export function useSession(): SessionAnswer | null {
  return useSessionStore((state) => state.answer);
}

import { create } from 'zustand';

import { reportError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

import { startSessionWith, type SessionAnswer } from './start-session';

export type { SessionAnswer } from './start-session';

const useSessionStore = create<{ answer: SessionAnswer | null; failed: boolean }>(() => ({
  answer: null,
  failed: false,
}));

let inFlight: Promise<SessionAnswer> | undefined;

/**
 * Finds the stored session or signs in as a guest. Calls made while one is running share
 * it; after an `offline` or `refused` answer, calling again tries again. A real error is
 * reported to Sentry, kept for `useSessionFailed()` and thrown to the caller.
 */
export function startSession(): Promise<SessionAnswer> {
  inFlight ??= startSessionWith(supabase)
    .then((answer) => {
      useSessionStore.setState({ answer, failed: false });
      return answer;
    })
    .catch((error: unknown) => {
      useSessionStore.setState({ answer: null, failed: true });
      reportError(error);
      throw error;
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

/** True after the last start threw a real error (reported already); a new start clears it. */
export function useSessionFailed(): boolean {
  return useSessionStore((state) => state.failed);
}

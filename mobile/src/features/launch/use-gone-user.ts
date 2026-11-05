import { ApiError, type MyProfile } from '@flimme/contract';
import { useEffect, useRef, useState } from 'react';

import { wipeLocalData } from '@/features/account/wipe-app';
import { checkUserWith, type SessionAnswer } from '@/features/session/start-session';
import { supabase } from '@/lib/supabase';

type Input = {
  session: SessionAnswer | null;
  /** What the profile read has answered so far. */
  profile: { data: MyProfile | null | undefined; error: unknown };
};

/**
 * A stored session whose user no longer exists (deleted elsewhere, or by the guest cleanup)
 * starts again as a new guest (settings.md). It only asks when something looks wrong: the
 * profile came back empty or without a name, or the read was denied. The check gives the
 * session one refresh before it counts, so a plain expired token keeps its user. While it
 * runs, the splash keeps loading.
 */
export function useGoneUserRecovery({ session, profile }: Input): { checking: boolean } {
  const [done, setDone] = useState(false);
  const asked = useRef(false);

  const denied = profile.error instanceof ApiError && profile.error.kind === 'denied';
  const looksWrong =
    profile.data === null || profile.data?.display_name === '' || (denied && !profile.data);
  const suspicious = session?.status === 'ok' && !session.isNew && looksWrong;

  useEffect(() => {
    if (!suspicious || asked.current) return;
    asked.current = true;
    checkUserWith(supabase)
      .then((check) => (check === 'gone' ? wipeLocalData() : undefined))
      .catch(() => {})
      .finally(() => setDone(true));
  }, [suspicious]);

  return { checking: suspicious && !done };
}

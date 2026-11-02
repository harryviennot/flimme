// First launch signs in as a guest; every later launch finds the stored session and keeps
// the same user (app-structure.md#sign-in). The answer is a status, not an error: the
// splash (M4.6) decides what each one looks like.
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import type { ApiClient } from '@/lib/supabase';

export type SessionAnswer =
  { status: 'ok'; userId: string; isNew: boolean } | { status: 'offline' } | { status: 'refused' };

// Supabase limits anonymous sign-ins per IP (30 an hour), and can ask for a bot check.
const refusedCodes = new Set(['over_request_rate_limit', 'captcha_failed']);

function answerFor(error: unknown): SessionAnswer {
  if (isAuthApiError(error) && (error.status === 429 || refusedCodes.has(error.code ?? ''))) {
    return { status: 'refused' };
  }
  if (isAuthRetryableFetchError(error)) return { status: 'offline' };
  // Anything else is a real error: the caller reports it.
  throw error;
}

export async function startSessionWith(client: ApiClient): Promise<SessionAnswer> {
  const stored = await client.auth.getSession();
  if (stored.error) return answerFor(stored.error);
  if (stored.data.session) {
    return { status: 'ok', userId: stored.data.session.user.id, isNew: false };
  }

  const created = await client.auth.signInAnonymously();
  if (created.error) return answerFor(created.error);
  if (!created.data.user) throw new Error('Sign-in answered without a user.');
  return { status: 'ok', userId: created.data.user.id, isNew: true };
}

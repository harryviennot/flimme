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

export type UserCheck = 'ok' | 'gone' | 'unknown';

// What Auth answers for a token whose user was deleted (by the player elsewhere, or by the
// guest cleanup): the user is not found, or the token is no longer accepted.
const goneStatuses = new Set([401, 403, 404]);

function isGone(error: unknown): boolean {
  return (
    isAuthApiError(error) && (goneStatuses.has(error.status) || error.code === 'user_not_found')
  );
}

/**
 * Whether the user behind the stored session still exists (settings.md, a session whose user
 * is gone). Asks Auth for the user; a refusal is given one session refresh before it counts,
 * so an expired token that refreshes keeps its user. No connection, or any answer that is not
 * a clear "gone", is `unknown`: the player keeps playing and the next launch asks again.
 */
export async function checkUserWith(client: ApiClient): Promise<UserCheck> {
  const first = await client.auth.getUser();
  if (!first.error) return 'ok';
  if (isAuthRetryableFetchError(first.error)) return 'unknown';
  if (!isGone(first.error)) return 'unknown';

  const refreshed = await client.auth.refreshSession();
  if (refreshed.error) {
    if (isAuthRetryableFetchError(refreshed.error)) return 'unknown';
    // The refresh token went with the user: nothing is left to refresh.
    return isAuthApiError(refreshed.error) && refreshed.error.status !== 429 ? 'gone' : 'unknown';
  }
  const second = await client.auth.getUser();
  if (!second.error) return 'ok';
  return isGone(second.error) ? 'gone' : 'unknown';
}

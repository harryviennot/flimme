import type { DeleteCallResult } from './server';

export type DeleteOutcome = 'done' | 'try_again';

export type DeleteDeps = {
  /** The session's access token, or null when there is none. */
  getToken: () => Promise<string | null>;
  /** Refreshes the session and answers the new access token, or null when it cannot. */
  refreshToken: () => Promise<string | null>;
  call: (token: string) => Promise<DeleteCallResult>;
  /** Signs out and clears everything on the phone, then starts a new guest. */
  wipe: () => Promise<void>;
  /** Reports a status that means a bug (never the token). */
  report?: (message: string) => void;
};

/**
 * Deletes the player's data (settings.md, "The delete sheet"): `ok` wipes the phone; `unauthorized`
 * refreshes the session once and sends again; `try_again` and a failed call wipe nothing and ask
 * the player to try again (the server finishes the job on a retry).
 */
export async function runDeleteAccount(deps: DeleteDeps): Promise<DeleteOutcome> {
  let token = await deps.getToken();
  token ??= await deps.refreshToken();
  if (!token) return 'try_again';

  let answer = await deps.call(token);
  if (answer === 'unauthorized') {
    const fresh = await deps.refreshToken();
    if (!fresh) return 'try_again';
    answer = await deps.call(fresh);
  }

  if (answer === 'ok') {
    await deps.wipe();
    return 'done';
  }
  if (answer === 'unauthorized') deps.report?.('delete_account: unauthorized after a refresh');
  return 'try_again';
}

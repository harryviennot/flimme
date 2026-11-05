// The recommendation server's HTTP API, from the phone. The only call so far is account
// deletion (security.md#account-deletion-and-data-export). The server answers JSON with a
// `status` field and the HTTP code that goes with it (python-server skill).
import { DELETE_ACCOUNT_ANSWERS, type DeleteAccountAnswer } from '@flimme/contract';

/** What the phone makes of a call: an answer, or `failed` (no connection, a timeout, a body it cannot read). */
export type DeleteCallResult = DeleteAccountAnswer | 'failed';

export const DELETE_TIMEOUT_MS = 20_000;

type Options = {
  serverUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * `POST /v1/account/delete` with the session's access token and no body. Deletion is idempotent
 * on the server, so a retry after `failed` or `try_again` is safe and finishes the job. Never
 * logs the token or the response.
 */
export async function postDeleteAccount({
  serverUrl,
  token,
  fetchImpl = fetch,
  timeoutMs = DELETE_TIMEOUT_MS,
}: Options): Promise<DeleteCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${serverUrl.replace(/\/+$/, '')}/v1/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = (await response.json()) as { status?: unknown } | null;
    const status = body?.status;
    if ((DELETE_ACCOUNT_ANSWERS as readonly unknown[]).includes(status)) {
      return status as DeleteAccountAnswer;
    }
    return 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

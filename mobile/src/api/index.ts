// The typed API: the wrappers live in packages/contract, this file only binds the one client.
// Payload shape checks run in development builds and tests, not in production.
import { ApiError, createApi } from '@flimme/contract';

import { reportError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

type AsyncFn = (...args: never[]) => Promise<unknown>;

/**
 * Sends the errors that mean a bug or an attack to Sentry (`denied`, `unexpected`) and rejects
 * as before. `network` is not reported: being offline is not a bug.
 */
export function reportingApi<T extends Record<string, AsyncFn>>(raw: T): T {
  const wrapped: Record<string, AsyncFn> = {};
  for (const [name, fn] of Object.entries(raw)) {
    wrapped[name] = async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (error instanceof ApiError && error.kind !== 'network') reportError(error);
        throw error;
      }
    };
  }
  return wrapped as T;
}

export const api = reportingApi(createApi(supabase, { validate: __DEV__ }));

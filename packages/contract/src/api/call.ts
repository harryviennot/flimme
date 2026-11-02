import type { SupabaseClient } from '@supabase/supabase-js';
import type * as z from 'zod/mini';

import type { Database } from '../database.types';
import { ApiError, type ApiErrorKind } from './errors';

export type ApiClient = SupabaseClient<Database, 'api'>;
export type Functions = Database['api']['Functions'];
export type ApiOptions = {
  /** Check each response's shape against its schema. On in development and tests, off in production. */
  validate?: boolean;
};

type RpcError = { message?: string; code?: string };
type RpcResponse = { data: unknown; error: RpcError | null; status?: number };
type RawClient = { rpc(fn: string, args: unknown): PromiseLike<RpcResponse> };

// 401 and 403 mean an expired or missing session: a bug or an attack, so `denied`.
function classify(error: RpcError, status: number | undefined): ApiErrorKind {
  if (error.code === '42501' || error.code === 'PGRST301' || status === 401 || status === 403) {
    return 'denied';
  }
  // A failed fetch has no database code and no HTTP status.
  if (!error.code && (status === undefined || status === 0)) return 'network';
  return 'unexpected';
}

// The one place `.rpc` is called. The name and arguments are typed by the callers.
async function send(client: ApiClient, fn: string, args: unknown): Promise<unknown> {
  let response: RpcResponse;
  try {
    response = await (client as unknown as RawClient).rpc(fn, args);
  } catch (cause) {
    throw new ApiError('network', fn, 'the request failed', { cause });
  }
  if (response.error) {
    const { error, status } = response;
    throw new ApiError(classify(error, status), fn, error.message ?? 'database error', {
      code: error.code || undefined,
      cause: error,
    });
  }
  return response.data;
}

/**
 * Calls one `api` function and returns its answer. `answers` is the function's list from
 * answers.ts: a status outside it is a bug, not an answer, and rejects as `unexpected`.
 */
export async function callAnswer<F extends keyof Functions, R extends { status: string }>(
  client: ApiClient,
  options: ApiOptions,
  fn: F,
  args: Functions[F]['Args'],
  answers: readonly string[],
  schema: z.ZodMiniType<R>,
): Promise<R> {
  const data = await send(client, fn, args);
  const status = (data as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !answers.includes(status)) {
    throw new ApiError('unexpected', fn, `unknown answer ${JSON.stringify(status)}`);
  }
  if (options.validate) {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError('unexpected', fn, `wrong shape: ${parsed.error.message}`);
    }
    return parsed.data;
  }
  return data as R;
}

/** The same call for a function that returns `void`. */
export async function callVoid<F extends keyof Functions>(
  client: ApiClient,
  fn: F,
  args: Functions[F]['Args'],
): Promise<void> {
  await send(client, fn, args);
}

/** Reads rows of an `api` view. A database error rejects like a function's. */
export async function readView<T>(
  run: () => PromiseLike<{ data: T | null; error: RpcError | null; status?: number }>,
  fn: string,
): Promise<T | null> {
  let response;
  try {
    response = await run();
  } catch (cause) {
    throw new ApiError('network', fn, 'the request failed', { cause });
  }
  if (response.error) {
    throw new ApiError(
      classify(response.error, response.status),
      fn,
      response.error.message ?? 'database error',
      {
        code: response.error.code || undefined,
        cause: response.error,
      },
    );
  }
  return response.data;
}

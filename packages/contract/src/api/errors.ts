// Statuses are answers and resolve as values. Only real errors reject, as an ApiError.
export type ApiErrorKind =
  /** The request never reached the server: offline, a timeout. Not reported. */
  | 'network'
  /** Not allowed (SQLSTATE 42501, a missing or expired session). A bug or an attack. */
  | 'denied'
  /** Anything else: an answer the app doesn't know, a payload of the wrong shape, a database error. */
  | 'unexpected';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly fn: string;
  readonly code?: string;

  constructor(
    kind: ApiErrorKind,
    fn: string,
    message: string,
    options?: { code?: string; cause?: unknown },
  ) {
    super(`${fn}: ${message}`, { cause: options?.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.fn = fn;
    this.code = options?.code;
  }
}

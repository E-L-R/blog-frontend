/**
 * Errors from the API, normalized. blog-backend answers errors as RFC 9457 problem details
 * (`application/problem+json`) with a stable `type` URI; clients branch on that, never on the text.
 */

export type ProblemKind =
  | 'validation'
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'payload-too-large'
  | 'internal'
  | 'unknown';

export interface FieldViolation {
  field: string;
  message: string;
}

export type ErrorReason = 'http' | 'network' | 'timeout' | 'contract' | 'unauthenticated';

interface ApiErrorInit {
  reason: ErrorReason;
  status?: number;
  kind?: ProblemKind;
  title?: string;
  detail?: string;
  fieldErrors?: FieldViolation[];
  traceId?: string | null;
  retryAfterSeconds?: number | null;
}

export class ApiError extends Error {
  /** What went wrong at the transport level. Only `http` errors carry a server response. */
  readonly reason: ErrorReason;
  /** HTTP status; 0 when no response was received. */
  readonly status: number;
  readonly kind: ProblemKind;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  readonly fieldErrors: FieldViolation[];
  /** The backend's `X-Trace-Id`: quote it in bug reports, it finds the request in the server logs. */
  readonly traceId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit) {
    super(init.detail ?? init.title ?? `API request failed (${init.reason})`);
    this.name = 'ApiError';
    this.reason = init.reason;
    this.status = init.status ?? 0;
    this.kind = init.kind ?? 'unknown';
    this.title = init.title;
    this.detail = init.detail;
    this.fieldErrors = init.fieldErrors ?? [];
    this.traceId = init.traceId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  get isNotFound(): boolean {
    return this.reason === 'http' && this.status === 404;
  }

  get isConflict(): boolean {
    return this.reason === 'http' && this.status === 409;
  }

  get isUnauthorized(): boolean {
    return this.reason === 'unauthenticated' || (this.reason === 'http' && this.status === 401);
  }
}

const KINDS_BY_STATUS: Record<number, ProblemKind> = {
  400: 'bad-request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  413: 'payload-too-large',
  429: 'rate-limited',
};

const KNOWN_KINDS = new Set<string>([
  'validation',
  'bad-request',
  'unauthorized',
  'forbidden',
  'not-found',
  'conflict',
  'rate-limited',
  'payload-too-large',
  'internal',
]);

/** `https://…/docs/problems.md#conflict` → `conflict`; falls back to the HTTP status. */
export function problemKind(type: unknown, status: number): ProblemKind {
  if (typeof type === 'string') {
    const fragment = type.slice(type.lastIndexOf('#') + 1);
    if (KNOWN_KINDS.has(fragment)) {
      return fragment as ProblemKind;
    }
  }
  return KINDS_BY_STATUS[status] ?? (status >= 500 ? 'internal' : 'unknown');
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function fieldViolations(value: unknown): FieldViolation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const { field, message } = item as Record<string, unknown>;
    return typeof field === 'string' && typeof message === 'string' ? [{ field, message }] : [];
  });
}

/** `Retry-After` is either seconds or an HTTP date (RFC 9110 §10.2.3). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.ceil(seconds));
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000));
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON (a proxy's HTML error page, for example): fall back to the status alone.
  }
  return new ApiError({
    reason: 'http',
    status: response.status,
    kind: problemKind(body.type, response.status),
    title: asString(body.title),
    detail: asString(body.detail),
    fieldErrors: fieldViolations(body.errors),
    traceId: response.headers.get('X-Trace-Id'),
    retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
  });
}

/** A sentence a person can act on, for any error the UI may meet. */
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.reason) {
    case 'network':
      return "Can't reach the server. Check your connection and try again.";
    case 'timeout':
      return 'The server took too long to answer. Please try again.';
    case 'contract':
      return 'The server sent an answer this app does not understand. Please reload the page.';
    case 'unauthenticated':
      return 'Please sign in to continue.';
    case 'http':
      break;
  }
  if (error.kind === 'rate-limited') {
    const wait = error.retryAfterSeconds;
    return wait !== null && wait > 0
      ? `Too many requests. Please try again in ${formatWait(wait)}.`
      : 'Too many requests. Please wait a moment and try again.';
  }
  if (error.status >= 500) {
    return error.traceId !== null
      ? `Something went wrong on our side. If it keeps happening, report reference ${error.traceId}.`
      : 'Something went wrong on our side. Please try again later.';
  }
  if (error.kind === 'unauthorized') {
    return error.detail ?? 'Your session has ended. Please sign in again.';
  }
  return error.detail ?? error.title ?? 'The request could not be completed.';
}

function formatWait(seconds: number): string {
  if (seconds < 60) {
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

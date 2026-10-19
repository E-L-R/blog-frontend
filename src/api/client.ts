import type { z } from 'zod';
import { apiUrl, config } from '../config/env.ts';
import { ApiError, errorFromResponse } from './errors.ts';

/**
 * The single place that talks HTTP to blog-backend:
 * - timeouts, so a hung connection never spins forever
 * - problem details → `ApiError`, network failures → `ApiError` with `reason: 'network'`
 * - response validation against the zod schemas
 * - bearer tokens for authenticated calls, with exactly one retry after a token refresh
 */

export interface AuthHandler {
  /** A valid access token (refreshed if it's about to expire), or null when signed out. */
  getAccessToken(): Promise<string | null>;
  /** The server rejected `rejected` with 401: get a new access token, or null if the session is over. */
  refreshAfterRejection(rejected: string): Promise<string | null>;
}

let authHandler: AuthHandler | null = null;

/** Called once by the session module; the client itself knows nothing about token storage. */
export function setAuthHandler(handler: AuthHandler | null): void {
  authHandler = handler;
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue | readonly QueryValue[]>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Send the access token. Public reads don't, so they stay cacheable and identical for everyone. */
  auth?: boolean;
  signal?: AbortSignal;
}

/** A request whose response body is validated against `schema`. */
export async function apiJson<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const response = await send(path, options);
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    // Reading the body can be interrupted too: by the caller (React Query cancels a fetch it is
    // about to repeat) or by our timeout. Neither means the server sent bad JSON.
    if (options.signal?.aborted) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError({ reason: 'timeout' });
    }
    throw contractError(path, 'The response body is not JSON.');
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw contractError(path, result.error.message);
  }
  return result.data;
}

/** A request with no meaningful response body (204 No Content, or a body the UI doesn't need). */
export async function apiVoid(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}

function contractError(path: string, problem: string): ApiError {
  // Logged for developers: the UI shows a generic message (see userMessage).
  console.error(`API contract mismatch for ${path}: ${problem}`);
  return new ApiError({ reason: 'contract', detail: problem });
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const url = buildUrl(path, options.query);
  if (!options.auth) {
    return checked(await fetchOnce(url, options, null));
  }
  if (authHandler === null) {
    throw new ApiError({ reason: 'unauthenticated' });
  }
  const token = await authHandler.getAccessToken();
  if (token === null) {
    throw new ApiError({ reason: 'unauthenticated' });
  }
  const response = await fetchOnce(url, options, token);
  if (response.status !== 401) {
    return checked(response);
  }
  // The token expired early or was issued before a server restart with new keys: refresh once.
  const fresh = await authHandler.refreshAfterRejection(token);
  if (fresh === null) {
    throw new ApiError({ reason: 'unauthenticated' });
  }
  return checked(await fetchOnce(url, options, fresh));
}

async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  return response;
}

export function buildUrl(path: string, query: Query | undefined): URL {
  const url = apiUrl(path);
  for (const [name, raw] of Object.entries(query ?? {})) {
    const values: readonly QueryValue[] = Array.isArray(raw) ? raw : [raw as QueryValue];
    for (const value of values) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.append(name, String(value));
      }
    }
  }
  return url;
}

async function fetchOnce(
  url: URL,
  options: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json, application/problem+json' });
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const timeout = AbortSignal.timeout(config.requestTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
      // Bearer tokens only: never send or accept cookies (blog-backend's CORS allows no credentials).
      credentials: 'omit',
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error; // cancelled by the caller (e.g. React Query): not an error to show
    }
    if (timeout.aborted) {
      throw new ApiError({ reason: 'timeout' });
    }
    throw new ApiError({ reason: 'network', detail: String(error) });
  }
}

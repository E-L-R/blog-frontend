import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors.ts';

/** Retrying only helps for transient problems: network, timeouts, 5xx. A 404 stays a 404. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }
  if (!(error instanceof ApiError)) {
    return false;
  }
  return (
    error.reason === 'network' ||
    error.reason === 'timeout' ||
    (error.reason === 'http' && error.status >= 500)
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false, // never repeat a write on its own
      },
    },
  });
}

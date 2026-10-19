import { describe, expect, it } from 'vitest';
import {
  ApiError,
  errorFromResponse,
  parseRetryAfter,
  problemKind,
  userMessage,
} from './errors.ts';

const problemResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  });

describe('problemKind', () => {
  it('reads the fragment of blog-backend’s problem type URIs', () => {
    expect(
      problemKind('https://github.com/E-L-R/blog-backend/blob/main/docs/problems.md#conflict', 409),
    ).toBe('conflict');
    expect(problemKind('https://example.com/problems.md#validation', 400)).toBe('validation');
  });

  it('falls back to the status for unknown or missing types', () => {
    expect(problemKind('about:blank', 404)).toBe('not-found');
    expect(problemKind(undefined, 429)).toBe('rate-limited');
    expect(problemKind(undefined, 503)).toBe('internal');
    expect(problemKind(undefined, 418)).toBe('unknown');
  });
});

describe('parseRetryAfter', () => {
  it('accepts seconds and HTTP dates', () => {
    expect(parseRetryAfter('120')).toBe(120);
    const now = Date.parse('2026-10-19T12:00:00Z');
    expect(parseRetryAfter('Mon, 19 Oct 2026 12:00:30 GMT', now)).toBe(30);
  });

  it('ignores missing or garbage values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('errorFromResponse', () => {
  it('turns problem details into an ApiError with field errors and trace id', async () => {
    const error = await errorFromResponse(
      problemResponse(
        400,
        {
          type: 'https://x/problems.md#validation',
          title: 'Validation failed',
          detail: 'One or more fields are invalid.',
          errors: [{ field: 'title', message: 'must not be blank' }, { bogus: true }],
        },
        { 'X-Trace-Id': 'abc123' },
      ),
    );
    expect(error).toMatchObject({
      reason: 'http',
      status: 400,
      kind: 'validation',
      detail: 'One or more fields are invalid.',
      fieldErrors: [{ field: 'title', message: 'must not be blank' }],
      traceId: 'abc123',
    });
  });

  it('survives non-JSON error pages (e.g. a proxy’s HTML)', async () => {
    const error = await errorFromResponse(
      new Response('<html>Bad Gateway</html>', { status: 502 }),
    );
    expect(error.kind).toBe('internal');
    expect(error.status).toBe(502);
  });
});

describe('userMessage', () => {
  it('explains rate limits with the wait time', () => {
    const error = new ApiError({
      reason: 'http',
      status: 429,
      kind: 'rate-limited',
      retryAfterSeconds: 90,
    });
    expect(userMessage(error)).toBe('Too many requests. Please try again in 2 minutes.');
  });

  it('gives a reference for server errors, never internals', () => {
    const error = new ApiError({
      reason: 'http',
      status: 500,
      kind: 'internal',
      traceId: 'f00d',
      detail: 'NullPointerException at …',
    });
    expect(userMessage(error)).toContain('reference f00d');
    expect(userMessage(error)).not.toContain('NullPointer');
  });

  it('uses the problem detail for client errors', () => {
    const error = new ApiError({
      reason: 'http',
      status: 409,
      kind: 'conflict',
      detail: 'A post needs content before it can be published.',
    });
    expect(userMessage(error)).toBe('A post needs content before it can be published.');
  });

  it('has a message for every transport failure', () => {
    for (const reason of ['network', 'timeout', 'contract', 'unauthenticated'] as const) {
      expect(userMessage(new ApiError({ reason }))).not.toBe('');
    }
    expect(userMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});

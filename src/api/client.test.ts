import { http, HttpResponse } from 'msw/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { server } from '../test/server.ts';
import { type AuthHandler, apiJson, apiVoid, buildUrl, setAuthHandler } from './client.ts';
import { ApiError } from './errors.ts';
import { session } from '../auth/session.ts';

const thing = z.object({ name: z.string() });

afterEach(() => {
  setAuthHandler(session); // restore the real handler for other tests
});

describe('buildUrl', () => {
  it('encodes query values and skips empty ones', () => {
    const url = buildUrl('/api/v1/posts', {
      q: 'a&b c',
      tag: '',
      author: undefined,
      page: 0,
      ids: ['1', '2'],
    });
    expect(url.pathname).toBe('/api/v1/posts');
    expect(url.searchParams.get('q')).toBe('a&b c');
    expect(url.searchParams.has('tag')).toBe(false);
    expect(url.searchParams.has('author')).toBe(false);
    expect(url.searchParams.get('page')).toBe('0');
    expect(url.searchParams.getAll('ids')).toEqual(['1', '2']);
  });
});

describe('apiJson', () => {
  it('validates the response against the schema', async () => {
    server.use(http.get('*/api/v1/thing', () => HttpResponse.json({ name: 'ok', extra: 1 })));
    await expect(apiJson('/api/v1/thing', thing)).resolves.toEqual({ name: 'ok' });
  });

  it('reports a contract mismatch instead of passing bad data on', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(http.get('*/api/v1/thing', () => HttpResponse.json({ name: 42 })));
    const error = await apiJson('/api/v1/thing', thing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).reason).toBe('contract');
    expect(log).toHaveBeenCalled();
  });

  it('treats a cancellation while reading the body as a cancellation, not a contract error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new AbortController();
    const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    vi.spyOn(response, 'json').mockImplementation(() => {
      controller.abort(); // React Query cancels the request it is about to repeat…
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const error = await apiJson('/api/v1/thing', thing, { signal: controller.signal }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(log).not.toHaveBeenCalled();
  });

  it('maps network failures', async () => {
    server.use(http.get('*/api/v1/thing', () => HttpResponse.error()));
    await expect(apiJson('/api/v1/thing', thing)).rejects.toMatchObject({ reason: 'network' });
  });

  it('never sends cookies, and only sends a token when asked to', async () => {
    let auth: string | null = null;
    server.use(
      http.get('*/api/v1/thing', ({ request }) => {
        auth = request.headers.get('Authorization');
        return HttpResponse.json({ name: 'ok' });
      }),
    );
    // Node's fetch ignores `credentials`, so check what the client asks the browser for.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setAuthHandler({
      getAccessToken: () => Promise.resolve('t1'),
      refreshAfterRejection: () => Promise.resolve(null),
    });
    await apiJson('/api/v1/thing', thing);
    expect(auth).toBeNull();
    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe('omit');
    await apiJson('/api/v1/thing', thing, { auth: true });
    expect(auth).toBe('Bearer t1');
  });
});

describe('authenticated requests', () => {
  function handler(tokens: {
    first: string;
    fresh: string | null;
  }): AuthHandler & { refreshed: string[] } {
    const refreshed: string[] = [];
    return {
      refreshed,
      getAccessToken: () => Promise.resolve(tokens.first),
      refreshAfterRejection: (rejected) => {
        refreshed.push(rejected);
        return Promise.resolve(tokens.fresh);
      },
    };
  }

  it('refreshes once after a 401 and retries with the new token', async () => {
    const auth = handler({ first: 'old', fresh: 'new' });
    setAuthHandler(auth);
    server.use(
      http.delete('*/api/v1/thing', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer new'
          ? new HttpResponse(null, { status: 204 })
          : new HttpResponse(null, { status: 401 }),
      ),
    );
    await apiVoid('/api/v1/thing', { method: 'DELETE', auth: true });
    expect(auth.refreshed).toEqual(['old']);
  });

  it('gives up when the session cannot be refreshed', async () => {
    setAuthHandler(handler({ first: 'old', fresh: null }));
    server.use(http.delete('*/api/v1/thing', () => new HttpResponse(null, { status: 401 })));
    await expect(apiVoid('/api/v1/thing', { method: 'DELETE', auth: true })).rejects.toMatchObject({
      reason: 'unauthenticated',
    });
  });

  it('does not loop when the fresh token is rejected too', async () => {
    const auth = handler({ first: 'old', fresh: 'new' });
    setAuthHandler(auth);
    server.use(
      http.delete('*/api/v1/thing', () =>
        HttpResponse.json({ type: 'x#forbidden', detail: 'no' }, { status: 401 }),
      ),
    );
    await expect(apiVoid('/api/v1/thing', { method: 'DELETE', auth: true })).rejects.toMatchObject({
      reason: 'http',
      status: 401,
    });
    expect(auth.refreshed).toHaveLength(1);
  });

  it('fails fast without a session, without calling the server', async () => {
    setAuthHandler({
      getAccessToken: () => Promise.resolve(null),
      refreshAfterRejection: () => Promise.resolve(null),
    });
    await expect(apiVoid('/api/v1/never-called', { auth: true })).rejects.toMatchObject({
      reason: 'unauthenticated',
    });
  });
});

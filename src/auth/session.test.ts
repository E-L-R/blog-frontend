import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors.ts';
import type { TokenResponse } from '../api/schemas.ts';
import { Session, type SessionDeps } from './session.ts';

const KEY = 'blog.auth.refreshToken';

function tokens(n: number, expiresIn = 900): TokenResponse {
  return {
    accessToken: `access-${n}`,
    tokenType: 'Bearer',
    expiresIn,
    refreshToken: `refresh-${n}`,
    refreshExpiresIn: 604800,
  };
}

/** A Web Locks stand-in: callbacks for the same name run strictly one after another. */
function fakeLocks() {
  let queue = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      const result = queue.then(callback);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    map,
  };
}

function createSession(overrides: Partial<SessionDeps> = {}) {
  let now = 1_000_000;
  const deps: SessionDeps = {
    storage: memoryStorage(),
    locks: fakeLocks(),
    channel: null,
    now: () => now,
    refresh: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  const session = new Session(deps);
  const events: string[] = [];
  session.subscribe((event) => events.push(event));
  return {
    session,
    deps,
    events,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('Session', () => {
  it('keeps the access token in memory and only the refresh token in storage', async () => {
    const storage = memoryStorage();
    const { session, events } = createSession({ storage });
    session.start(tokens(1));
    expect(await session.getAccessToken()).toBe('access-1');
    expect([...storage.map.entries()]).toEqual([[KEY, 'refresh-1']]);
    expect(events).toEqual(['signed-in']);
  });

  it('refreshes shortly before the access token expires', async () => {
    const refresh = vi.fn(() => Promise.resolve(tokens(2)));
    const { session, advance } = createSession({ refresh });
    session.start(tokens(1, 900));
    advance(880_000); // 20 s left: inside the safety margin
    expect(await session.getAccessToken()).toBe('access-2');
    expect(refresh).toHaveBeenCalledWith('refresh-1');
  });

  it('shares one refresh between concurrent callers (single-flight)', async () => {
    let resolve: (value: TokenResponse) => void = () => undefined;
    const refresh = vi.fn(() => new Promise<TokenResponse>((r) => (resolve = r)));
    const { session } = createSession({ refresh, storage: memoryStorage({ [KEY]: 'refresh-1' }) });
    const calls = [session.getAccessToken(), session.getAccessToken(), session.refresh()];
    await Promise.resolve();
    resolve(tokens(2));
    expect(await Promise.all(calls)).toEqual(['access-2', 'access-2', 'access-2']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('re-reads the refresh token inside the lock, so it never reuses a rotated one', async () => {
    // Two tabs share storage and the lock: tab A rotates refresh-1 → refresh-2 first.
    const storage = memoryStorage({ [KEY]: 'refresh-1' });
    const locks = fakeLocks();
    const used: string[] = [];
    let counter = 1;
    const refresh = vi.fn((token: string) => {
      used.push(token);
      counter += 1;
      return Promise.resolve(tokens(counter));
    });
    const tabA = createSession({ storage, locks, refresh }).session;
    const tabB = createSession({ storage, locks, refresh }).session;
    await Promise.all([tabA.refresh(), tabB.refresh()]);
    expect(used).toEqual(['refresh-1', 'refresh-2']); // never refresh-1 twice: no reuse detection
  });

  it('adopts an access token another tab shared, instead of refreshing again', async () => {
    const listeners: ((event: MessageEvent) => void)[] = [];
    const channel = {
      postMessage: vi.fn(),
      addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) =>
        listeners.push(listener),
      close: vi.fn(),
    };
    const refresh = vi.fn();
    const { session } = createSession({
      channel,
      refresh,
      storage: memoryStorage({ [KEY]: 'refresh-9' }),
    });
    for (const listener of listeners) {
      listener(
        new MessageEvent('message', {
          data: { type: 'access-token', value: 'shared', expiresAt: 9_000_000 },
        }),
      );
    }
    expect(await session.getAccessToken()).toBe('shared');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ends the session when the server rejects the refresh token (expired, revoked or reused)', async () => {
    const refresh = vi.fn(() =>
      Promise.reject(new ApiError({ reason: 'http', status: 401, kind: 'unauthorized' })),
    );
    const storage = memoryStorage({ [KEY]: 'refresh-1' });
    const { session, events } = createSession({ refresh, storage });
    expect(await session.getAccessToken()).toBeNull();
    expect(storage.map.has(KEY)).toBe(false);
    expect(session.hasSession()).toBe(false);
    expect(events).toContain('expired');
  });

  it('keeps the session when the refresh fails for network reasons', async () => {
    const refresh = vi.fn(() => Promise.reject(new ApiError({ reason: 'network' })));
    const { session } = createSession({ refresh, storage: memoryStorage({ [KEY]: 'refresh-1' }) });
    await expect(session.getAccessToken()).rejects.toMatchObject({ reason: 'network' });
    expect(session.hasSession()).toBe(true);
  });

  it('drops a token the server rejected even if it looks unexpired', async () => {
    const refresh = vi.fn(() => Promise.resolve(tokens(2)));
    const { session } = createSession({ refresh });
    session.start(tokens(1));
    expect(await session.refreshAfterRejection('access-1')).toBe('access-2');
  });

  it('signs out locally even when the server is unreachable', async () => {
    const logout = vi.fn(() => Promise.reject(new Error('offline')));
    const storage = memoryStorage();
    const { session, events } = createSession({ logout, storage });
    session.start(tokens(1));
    await session.signOut();
    expect(logout).toHaveBeenCalledWith('refresh-1');
    expect(storage.map.size).toBe(0);
    expect(await session.getAccessToken()).toBeNull();
    expect(events).toEqual(['signed-in', 'signed-out']);
  });

  it('follows sign-in and sign-out in other tabs (storage events)', () => {
    const { session, events } = createSession();
    session.handleStorageChange(KEY, 'refresh-from-other-tab');
    expect(events).toEqual(['signed-in']);
    session.handleStorageChange(KEY, null);
    expect(events).toEqual(['signed-in', 'signed-out']);
    session.handleStorageChange('unrelated', null);
    expect(events).toHaveLength(2);
  });

  it('still works for this tab when storage is blocked', async () => {
    const refresh = vi.fn(() => Promise.resolve(tokens(2)));
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const { session, advance } = createSession({ storage: blocked, refresh });
    session.start(tokens(1));
    expect(session.hasSession()).toBe(true);
    advance(900_000);
    expect(await session.getAccessToken()).toBe('access-2');
  });
});

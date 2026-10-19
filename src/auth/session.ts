import { type AuthHandler, setAuthHandler } from '../api/client.ts';
import { authApi } from '../api/endpoints.ts';
import { ApiError } from '../api/errors.ts';
import type { TokenResponse } from '../api/schemas.ts';

/**
 * The browser side of blog-backend's token model (issues #18–#21):
 * - the **access token** (15 min JWT) lives in memory only: never in storage, so a stolen disk or a
 *   browser extension reading storage doesn't get it
 * - the **refresh token** (7 days, rotating) is kept in localStorage so a reload or a new tab stays
 *   signed in. Moving it to an httpOnly cookie is planned in the backend (see README, "Security").
 *
 * Rotation has a sharp edge: every refresh revokes the presented token, and presenting a revoked one
 * again counts as theft and revokes the whole session (reuse detection). Two tabs refreshing at once
 * would therefore sign the user out everywhere. So refreshes are single-flight within a tab and
 * serialized across tabs with the Web Locks API, the token is re-read from storage inside the lock,
 * and fresh access tokens are shared with other tabs over a BroadcastChannel.
 */

const REFRESH_TOKEN_KEY = 'blog.auth.refreshToken';
const LOCK_NAME = 'blog.auth.refresh';
const CHANNEL_NAME = 'blog.auth';
/** Refresh slightly before expiry, so a request never leaves with a token that dies in flight. */
const EXPIRY_MARGIN_MS = 30_000;

export type SessionEvent = 'signed-in' | 'signed-out' | 'expired';
type Listener = (event: SessionEvent) => void;

interface AccessToken {
  value: string;
  expiresAt: number;
}

type ChannelMessage =
  { type: 'access-token'; value: string; expiresAt: number } | { type: 'signed-out' };

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface ChannelLike {
  postMessage(message: ChannelMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<ChannelMessage>) => void): void;
  close(): void;
}

export interface SessionDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  locks: LockManagerLike | null;
  channel: ChannelLike | null;
  now: () => number;
  refresh: (refreshToken: string) => Promise<TokenResponse>;
  logout: (refreshToken: string) => Promise<void>;
}

export class Session implements AuthHandler {
  #access: AccessToken | null = null;
  /** Kept in memory too, for browsers that refuse storage (private modes, disabled storage). */
  #memoryRefreshToken: string | null = null;
  #storageWritable = true;
  #inflight: Promise<string | null> | null = null;
  readonly #listeners = new Set<Listener>();
  readonly #deps: SessionDeps;

  constructor(deps: SessionDeps) {
    this.#deps = deps;
    deps.channel?.addEventListener('message', (event) => {
      this.#onChannelMessage(event.data);
    });
  }

  /** True when a refresh token exists, i.e. the user is (probably) signed in. */
  hasSession(): boolean {
    return this.#readRefreshToken() !== null;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** After login: keep the tokens and tell every tab. */
  start(tokens: TokenResponse): void {
    this.#writeRefreshToken(tokens.refreshToken);
    this.#adopt(tokens);
    this.#emit('signed-in');
  }

  async getAccessToken(): Promise<string | null> {
    if (this.#isValid(this.#access)) {
      return this.#access.value;
    }
    return this.hasSession() ? this.refresh() : null;
  }

  async refreshAfterRejection(rejected: string): Promise<string | null> {
    if (this.#access?.value === rejected) {
      this.#access = null; // the server says it's no good, whatever its expiry claims
    }
    return this.getAccessToken();
  }

  /** Single-flight: concurrent callers share one refresh. */
  refresh(): Promise<string | null> {
    this.#inflight ??= this.#exclusive(() => this.#refreshNow()).finally(() => {
      this.#inflight = null;
    });
    return this.#inflight;
  }

  /** Revoke the refresh token on the server (best effort), then forget everything locally. */
  async signOut(): Promise<void> {
    const refreshToken = this.#readRefreshToken();
    this.#end('signed-out', true);
    if (refreshToken !== null) {
      try {
        await this.#deps.logout(refreshToken);
      } catch {
        // Offline or already revoked: the local session is gone either way.
      }
    }
  }

  /** Forget the session locally without telling the server (demo reset, tests). */
  clear(): void {
    this.#end('signed-out', true);
  }

  /** Another tab signed in or out (localStorage 'storage' event). */
  handleStorageChange(key: string | null, newValue: string | null): void {
    if (key !== REFRESH_TOKEN_KEY && key !== null) {
      return;
    }
    if (newValue === null && this.#memoryRefreshToken !== null) {
      this.#end('signed-out', false);
    } else if (newValue !== null && this.#memoryRefreshToken === null) {
      this.#memoryRefreshToken = newValue;
      this.#emit('signed-in');
    }
  }

  async #refreshNow(): Promise<string | null> {
    // While we waited for the lock, another tab may have refreshed and shared its access token.
    if (this.#isValid(this.#access)) {
      return this.#access.value;
    }
    // Read inside the lock: another tab may have rotated the token since we last looked.
    const refreshToken = this.#readRefreshToken();
    if (refreshToken === null) {
      return null;
    }
    try {
      const tokens = await this.#deps.refresh(refreshToken);
      this.#writeRefreshToken(tokens.refreshToken);
      this.#adopt(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.reason === 'http' && error.status < 500) {
        // Expired, revoked or reused refresh token: this session is over.
        this.#end('expired', true);
        return null;
      }
      throw error; // offline or server trouble: keep the session and let the caller show an error
    }
  }

  #exclusive<T>(task: () => Promise<T>): Promise<T> {
    return this.#deps.locks ? this.#deps.locks.request(LOCK_NAME, task) : task();
  }

  #adopt(tokens: TokenResponse): void {
    this.#access = {
      value: tokens.accessToken,
      expiresAt: this.#deps.now() + tokens.expiresIn * 1000,
    };
    this.#deps.channel?.postMessage({ type: 'access-token', ...this.#access });
  }

  #onChannelMessage(message: ChannelMessage): void {
    if (message.type === 'signed-out') {
      this.#end('signed-out', false);
    } else if (!this.#access || message.expiresAt > this.#access.expiresAt) {
      this.#access = { value: message.value, expiresAt: message.expiresAt };
    }
  }

  #end(event: SessionEvent, broadcast: boolean): void {
    const hadSession = this.#memoryRefreshToken !== null || this.#access !== null;
    this.#access = null;
    this.#memoryRefreshToken = null;
    try {
      this.#deps.storage?.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // storage unavailable: nothing stored to remove
    }
    if (broadcast) {
      this.#deps.channel?.postMessage({ type: 'signed-out' });
    }
    if (hadSession || event === 'expired') {
      this.#emit(event);
    }
  }

  #isValid(token: AccessToken | null): token is AccessToken {
    return token !== null && token.expiresAt - this.#deps.now() > EXPIRY_MARGIN_MS;
  }

  #readRefreshToken(): string | null {
    try {
      if (!this.#deps.storage || !this.#storageWritable) {
        return this.#memoryRefreshToken;
      }
      const stored = this.#deps.storage.getItem(REFRESH_TOKEN_KEY);
      if (stored !== null) {
        this.#memoryRefreshToken = stored;
      }
      return stored; // null: never signed in, or another tab signed out
    } catch {
      return this.#memoryRefreshToken;
    }
  }

  #writeRefreshToken(token: string): void {
    this.#memoryRefreshToken = token;
    try {
      this.#deps.storage?.setItem(REFRESH_TOKEN_KEY, token);
      this.#storageWritable = true;
    } catch {
      // Storage full or disabled: the session lasts as long as this tab.
      this.#storageWritable = false;
    }
  }

  #emit(event: SessionEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createBrowserSession(): Session {
  const channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
  const instance = new Session({
    storage: browserStorage(),
    locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null,
    channel,
    now: () => Date.now(),
    refresh: (token) => authApi.refresh(token),
    logout: (token) => authApi.logout(token),
  });
  window.addEventListener('storage', (event) => {
    instance.handleStorageChange(event.key, event.newValue);
  });
  return instance;
}

export const session = createBrowserSession();
setAuthHandler(session);

export const REFRESH_TOKEN_STORAGE_KEY = REFRESH_TOKEN_KEY;

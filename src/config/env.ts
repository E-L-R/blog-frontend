/**
 * Runtime configuration, fixed at build time by Vite (`VITE_*` variables).
 *
 * Without `VITE_API_BASE_URL` the app runs in demo mode: a mock API that follows blog-backend's
 * contract runs in a service worker, and a banner says so. Setting the variable switches to the
 * real backend with no code change.
 */
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export const config = {
  siteName: 'E-L-R Blog',
  apiBaseUrl,
  demoMode: apiBaseUrl === '',
  /** Requests slower than this are aborted, so a hung connection never spins forever. */
  requestTimeoutMs: 15_000,
  backendRepoUrl: 'https://github.com/E-L-R/blog-backend',
  frontendRepoUrl: 'https://github.com/E-L-R/blog-frontend',
  modelRepoUrl: 'https://github.com/E-L-R/blog-tldr-model',
} as const;

/** Absolute URL of an API path such as `/api/v1/posts`. */
export function apiUrl(path: string): URL {
  return new URL(path, config.apiBaseUrl === '' ? window.location.origin : config.apiBaseUrl);
}

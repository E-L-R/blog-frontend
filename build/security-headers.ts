/**
 * HTTP headers for every page of the app, defined once and used twice:
 * - written to Netlify's `_headers` file at build time (production and previews)
 * - applied by `vite preview`, so end-to-end tests run under the same Content-Security-Policy
 */
export interface HeaderOptions {
  /** Origin of the blog-backend API, e.g. `https://api.example.com`. Empty in demo mode. */
  apiBaseUrl: string;
  /** Allow search engines to index the site (only real content in production should be indexed). */
  indexable: boolean;
  /** Add `upgrade-insecure-requests` (HTTPS deployments only; it would break plain-HTTP localhost). */
  upgradeInsecureRequests: boolean;
}

export function apiOrigin(apiBaseUrl: string): string | null {
  if (apiBaseUrl === '') {
    return null;
  }
  const url = new URL(apiBaseUrl);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(`VITE_API_BASE_URL must use https (got ${apiBaseUrl})`);
  }
  return url.origin;
}

export function contentSecurityPolicy(options: HeaderOptions): string {
  const api = apiOrigin(options.apiBaseUrl);
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // Post content may embed images from any HTTPS host (the backend sanitizes the HTML).
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src 'self'${api ? ` ${api}` : ''}`,
    // Demo mode registers the mock API's service worker from this origin.
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (options.upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

export function documentHeaders(options: HeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': contentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  };
  if (!options.indexable) {
    headers['X-Robots-Tag'] = 'noindex';
  }
  return headers;
}

/** Netlify `_headers` file: https://docs.netlify.com/manage/routing/headers/ */
export function netlifyHeadersFile(options: HeaderOptions): string {
  const block = (path: string, headers: Record<string, string>) =>
    [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n');
  return (
    [
      block('/*', {
        ...documentHeaders(options),
        'Strict-Transport-Security': 'max-age=31536000',
      }),
      // Vite fingerprints everything in /assets/: a changed file gets a new name, so cache forever.
      block('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
      block('/mockServiceWorker.js', { 'Cache-Control': 'no-cache' }),
    ].join('\n\n') + '\n'
  );
}

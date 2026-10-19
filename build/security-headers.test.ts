import { describe, expect, it } from 'vitest';
import {
  apiOrigin,
  contentSecurityPolicy,
  documentHeaders,
  netlifyHeadersFile,
} from './security-headers.ts';

const live = {
  apiBaseUrl: 'https://api.example.com/',
  indexable: true,
  upgradeInsecureRequests: true,
};
const demo = { apiBaseUrl: '', indexable: false, upgradeInsecureRequests: true };

describe('security headers', () => {
  it('lets the page talk only to itself and the API', () => {
    const csp = contentSecurityPolicy(live);
    expect(csp).toContain("connect-src 'self' https://api.example.com");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(contentSecurityPolicy(demo)).toContain("connect-src 'self';");
  });

  it('refuses a plain-HTTP API outside localhost', () => {
    expect(() => apiOrigin('http://api.example.com')).toThrow(/https/);
    expect(apiOrigin('http://localhost:8080/api')).toBe('http://localhost:8080');
  });

  it('keeps demo data and previews out of search engines', () => {
    expect(documentHeaders(demo)['X-Robots-Tag']).toBe('noindex');
    expect(documentHeaders(live)['X-Robots-Tag']).toBeUndefined();
  });

  it('caches fingerprinted assets forever and the mock worker never', () => {
    const file = netlifyHeadersFile(live);
    expect(file).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    expect(file).toMatch(/\/mockServiceWorker\.js\n {2}Cache-Control: no-cache/);
    expect(file).toContain('Strict-Transport-Security: max-age=31536000');
  });
});

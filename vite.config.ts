import react from '@vitejs/plugin-react';
import { msw } from 'msw/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { netlify } from './build/netlify-plugin.ts';
import { apiOrigin, documentHeaders, type HeaderOptions } from './build/security-headers.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBaseUrl = (env.VITE_API_BASE_URL ?? '').trim();
  apiOrigin(apiBaseUrl); // fail the build early on an insecure API URL
  const demo = apiBaseUrl === '';
  const headerOptions: HeaderOptions = {
    apiBaseUrl,
    // Demo data and previews must never end up in search results.
    indexable: !demo && env.VITE_INDEXABLE === 'true',
    upgradeInsecureRequests: true,
  };

  return {
    plugins: [
      react(),
      // Demo mode runs the mock API in a service worker; real-API builds don't ship it.
      ...(demo ? [msw({ mode: 'worker-only' })] : []),
      netlify(headerOptions),
    ],
    build: {
      target: 'es2022',
      sourcemap: true,
    },
    preview: {
      // Same headers as production (minus the HTTPS upgrade), so E2E tests catch CSP violations.
      headers: documentHeaders({ ...headerOptions, upgradeInsecureRequests: false }),
    },
    test: {
      environment: 'jsdom',
      environmentOptions: { jsdom: { url: 'http://localhost:3000/' } },
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
        reporter: ['text-summary', 'html', 'lcov'],
        // Ratchet: a little below what the suite reaches. Raise when coverage rises, never lower.
        thresholds: { lines: 88, functions: 88, branches: 80, statements: 88 },
      },
    },
  };
});

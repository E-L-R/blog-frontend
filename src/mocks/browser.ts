import { setupWorker } from 'msw/browser';
import { session } from '../auth/session.ts';
import { MockDb } from './db.ts';
import { createHandlers } from './handlers.ts';

/**
 * Demo mode (no VITE_API_BASE_URL): the mock API runs in a service worker and keeps its data in
 * localStorage, so the demo feels like a real, persistent blog in this one browser.
 */

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const db = new MockDb({ storage: storage() });

export async function startDemoWorker(): Promise<void> {
  db.save();
  const worker = setupWorker(...createHandlers(db, { latencyMs: 250 }));
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    quiet: true,
    // Everything that isn't the API (scripts, styles, images) goes to the network as usual.
    onUnhandledFrame: 'bypass',
  });
}

export function resetDemoData(): void {
  db.reset();
  db.save();
  session.clear(); // the tokens belonged to the old data
}

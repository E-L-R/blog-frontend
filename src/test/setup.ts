import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { session } from '../auth/session.ts';
import { resetMockApi, server } from './server.ts';

beforeAll(() => {
  // Any request the mock API doesn't know is a bug in the test or the app: fail loudly.
  server.listen({ onUnhandledFrame: 'error' });
});

beforeEach(() => {
  resetMockApi();
});

afterEach(() => {
  cleanup();
  session.clear();
  window.localStorage.clear();
  document.title = '';
});

afterAll(() => {
  server.close();
});

// jsdom doesn't implement scrolling; the app calls these on navigation.
window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

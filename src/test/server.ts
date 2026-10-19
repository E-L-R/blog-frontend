import { setupServer } from 'msw/node';
import { MockDb, type MockDbOptions } from '../mocks/db.ts';
import { createHandlers } from '../mocks/handlers.ts';

/**
 * The tests talk to the same mock API as demo mode, through MSW's Node interceptor. Each test gets a
 * fresh database (see setup.ts); `server.use(...)` overrides single endpoints for error cases.
 */
export const server = setupServer();

export let db: MockDb = new MockDb({ tldrDelayMs: 0 });

export function resetMockApi(options: MockDbOptions = {}): MockDb {
  db = new MockDb({ tldrDelayMs: 0, ...options });
  server.resetHandlers(...createHandlers(db));
  return db;
}

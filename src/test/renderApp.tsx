import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { authApi } from '../api/endpoints.ts';
import { createQueryClient } from '../app/queryClient.ts';
import { routes } from '../app/routes.tsx';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import { session } from '../auth/session.ts';
import { SEED_USERS } from '../mocks/seed.ts';

/**
 * Renders the whole app (real routes, providers and API client) at `path`, against the mock API.
 * Tests drive it like a user: through roles, labels and text.
 */
export function renderApp(path = '/') {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient, user };
}

/** Starts a session for a seed user, as if they had signed in earlier (refresh token stored). */
export async function signInAs(name: keyof typeof SEED_USERS): Promise<void> {
  const { username, password } = SEED_USERS[name];
  session.start(await authApi.login(username, password));
}

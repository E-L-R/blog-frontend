import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors.ts';
import { RouteErrorPage } from '../app/ErrorPages.tsx';
import { shouldRetry } from '../app/queryClient.ts';
import { renderApp, signInAs } from '../test/renderApp.tsx';

describe('TagsPage', () => {
  it('lists tags of published posts, most used first, linking to the filtered list', async () => {
    renderApp('/tags');
    const list = await screen.findByRole('list');
    const links = within(list).getAllByRole('link');
    expect(links[0]).toHaveTextContent('#Java');
    expect(links[0]).toHaveAttribute('href', '/?tag=java');
    expect(within(list).queryByText(/#Docker/)).not.toBeInTheDocument(); // only on a draft
  });
});

describe('ProfilePage', () => {
  it('shows the profile and the author’s published posts', async () => {
    renderApp('/u/bob');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bob Okafor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 published posts')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Building a BPE tokenizer from scratch' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Java records/ })).not.toBeInTheDocument();
  });

  it('answers unknown users with not found', async () => {
    renderApp('/u/nobody');
    expect(await screen.findByText('There is no user called “nobody”.')).toBeInTheDocument();
  });
});

describe('editor tabs', () => {
  it('switches between Write and Preview with the arrow keys', async () => {
    await signInAs('demo');
    const { user } = renderApp('/write');
    const write = await screen.findByRole('tab', { name: 'Write' });
    write.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveFocus();
    expect(screen.getByText('Nothing to preview yet.')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(write).toHaveAttribute('aria-selected', 'true');
  });
});

describe('route errors', () => {
  it('shows a recoverable error page when a page crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Crash = () => {
      throw new Error('boom');
    };
    const router = createMemoryRouter([
      { path: '/', element: <Crash />, errorElement: <RouteErrorPage /> },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('turns a not-found error into the not-found page', async () => {
    const Missing = () => {
      throw new ApiError({ reason: 'http', status: 404, kind: 'not-found' });
    };
    const router = createMemoryRouter([
      { path: '/', element: <Missing />, errorElement: <RouteErrorPage /> },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows not found for unknown addresses', async () => {
    renderApp('/no/such/page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Back to the latest posts' }));
    expect(await screen.findByRole('heading', { name: 'Latest posts' })).toBeInTheDocument();
  });
});

describe('retry policy', () => {
  it('retries only transient failures, at most twice', () => {
    const http = (status: number) => new ApiError({ reason: 'http', status });
    expect(shouldRetry(0, new ApiError({ reason: 'network' }))).toBe(true);
    expect(shouldRetry(0, new ApiError({ reason: 'timeout' }))).toBe(true);
    expect(shouldRetry(1, http(503))).toBe(true);
    expect(shouldRetry(2, http(503))).toBe(false);
    expect(shouldRetry(0, http(404))).toBe(false);
    expect(shouldRetry(0, http(401))).toBe(false);
    expect(shouldRetry(0, new ApiError({ reason: 'contract' }))).toBe(false);
    expect(shouldRetry(0, new Error('render bug'))).toBe(false);
  });
});

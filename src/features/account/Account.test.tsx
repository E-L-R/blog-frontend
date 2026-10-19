import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { session } from '../../auth/session.ts';
import { renderApp, signInAs } from '../../test/renderApp.tsx';
import { db } from '../../test/server.ts';

describe('sign in', () => {
  it('signs in and returns to the page that asked for it', async () => {
    const { user, router } = renderApp('/login?next=%2Fdashboard');
    await user.type(await screen.findByLabelText('Username or email'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'demo-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(await screen.findByRole('heading', { name: 'My posts', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demo Author' })).toBeInTheDocument(); // header
    expect(session.hasSession()).toBe(true);
  });

  it('never redirects to another site after signing in', async () => {
    const { user, router } = renderApp('/login?next=https%3A%2F%2Fevil.example');
    await user.type(await screen.findByLabelText('Username or email'), 'demo@example.com');
    await user.type(screen.getByLabelText('Password'), 'demo-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('explains wrong credentials without saying which part was wrong', async () => {
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Username or email'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That username/email and password don’t match an account.',
    );
  });

  it('shows the demo account in demo mode', async () => {
    renderApp('/login');
    expect(await screen.findByText(/Demo: use/)).toBeInTheDocument();
  });
});

describe('register', () => {
  async function fill(user: ReturnType<typeof renderApp>['user'], values: Record<string, string>) {
    for (const [label, value] of Object.entries(values)) {
      await user.type(await screen.findByLabelText(label), value);
    }
  }

  it('creates the account and signs in', async () => {
    const { user, router } = renderApp('/register');
    await fill(user, {
      Username: 'carol',
      Email: 'carol@example.com',
      'Display name (optional)': 'Carol',
      Password: 'correct horse battery staple',
      'Confirm password': 'correct horse battery staple',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(await screen.findByRole('link', { name: 'Carol' })).toBeInTheDocument();
    expect(db.userByUsername('carol')).toBeDefined();
  });

  it('checks the backend’s password rules before sending', async () => {
    const { user } = renderApp('/register');
    await fill(user, {
      Username: 'carol',
      Email: 'carol@example.com',
      Password: 'carol-is-my-name',
      'Confirm password': 'something else',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('The password must not contain your username.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The passwords don’t match.')).toBeInTheDocument();
    expect(db.userByUsername('carol')).toBeUndefined();
  });

  it('shows the server’s answer when the username is taken', async () => {
    const { user } = renderApp('/register');
    await fill(user, {
      Username: 'alice',
      Email: 'someone@example.com',
      Password: 'a long enough passphrase',
      'Confirm password': 'a long enough passphrase',
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Username or email is already taken.',
    );
  });
});

describe('protected pages and sessions', () => {
  it('sends anonymous visitors to sign in first', async () => {
    const { router } = renderApp('/write');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(router.state.location.search).toBe('?next=%2Fwrite');
  });

  it('signs out, revoking the session on the server', async () => {
    await signInAs('demo');
    const { user, router } = renderApp('/dashboard');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(db.state.refreshTokens.every((token) => token.revoked)).toBe(true);
  });

  it('tells the user when the session ended by itself', async () => {
    await signInAs('demo');
    const { user } = renderApp('/dashboard');
    await screen.findByRole('heading', { name: 'My posts' });
    // The server revokes everything (password changed elsewhere, admin action…) and the access token expires.
    for (const token of db.state.refreshTokens) {
      token.revoked = true;
    }
    for (const token of db.state.accessTokens) {
      token.expiresAt = 0;
    }
    await user.click(screen.getByRole('link', { name: 'Drafts' }));
    const banner = await screen.findByText(/Your session has ended/);
    expect(within(banner).getByRole('link', { name: 'Sign in again' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument();
  });

  it('stays signed in across a reload, refreshing the access token once', async () => {
    await signInAs('demo');
    session.clear(); // a "reload": memory gone…
    window.localStorage.setItem(
      'blog.auth.refreshToken',
      db.state.refreshTokens.at(-1)!.token, // …but the refresh token was in storage
    );
    const before = db.state.refreshTokens.length;
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(db.state.refreshTokens.length).toBe(before + 1); // exactly one rotation
  });
});

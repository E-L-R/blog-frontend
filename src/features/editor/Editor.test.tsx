import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp, signInAs } from '../../test/renderApp.tsx';
import { db } from '../../test/server.ts';

const DRAFT = 'notes-on-container-image-layers';

describe('editor', () => {
  it('saves a new draft and continues at the post’s permanent address', async () => {
    await signInAs('demo');
    const { user, router } = renderApp('/write');
    await user.type(await screen.findByLabelText('Title'), 'Hello, Wörld!');
    await user.type(screen.getByLabelText('Tags'), 'Testing, testing, #Java');
    await user.type(screen.getByLabelText('Content (Markdown)'), 'First paragraph.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/write/hello-world');
    });
    const saved = db.postBySlug('hello-world')!;
    expect(saved.status).toBe('DRAFT');
    expect(saved.tags.map((tag) => tag.name)).toEqual(['Testing', 'Java']); // de-duplicated, # dropped
    expect(await screen.findByText(/Address: \/posts\/hello-world/)).toBeInTheDocument();
  });

  it('previews Markdown safely', async () => {
    await signInAs('demo');
    const { user } = renderApp('/write');
    await user.type(
      await screen.findByLabelText('Content (Markdown)'),
      '## Sub heading{enter}<img src=x onerror=alert(1)>',
    );
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    const panel = screen.getByRole('tabpanel', { name: 'Preview' });
    expect(within(panel).getByRole('heading', { name: 'Sub heading' })).toBeInTheDocument();
    expect(panel.innerHTML).not.toContain('onerror');
  });

  it('checks the tag limit before sending', async () => {
    await signInAs('demo');
    const { user } = renderApp('/write');
    await user.type(await screen.findByLabelText('Title'), 'Tags');
    await user.type(screen.getByLabelText('Tags'), 'a, b, c, d, e, f');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('At most 5 tags.')).toBeInTheDocument();
  });

  it('publishes a draft; the model then writes its TL;DR', async () => {
    await signInAs('demo');
    const { user } = renderApp(`/write/${DRAFT}`);
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(db.postBySlug(DRAFT)?.status).toBe('PUBLISHED');
    const panel = screen.getByRole('region', { name: 'TL;DR' });
    expect(
      await within(panel).findByText('Written by the model.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 10_000);

  it('lets the author write the TL;DR', async () => {
    await signInAs('demo');
    const { user } = renderApp(`/write/${DRAFT}`);
    const panel = await screen.findByRole('region', { name: 'TL;DR' });
    await user.click(within(panel).getByRole('button', { name: 'Write it yourself' }));
    await user.type(
      within(panel).getByLabelText('Your TL;DR'),
      'Order layers by how often they change.',
    );
    await user.click(within(panel).getByRole('button', { name: 'Save TL;DR' }));
    expect(await within(panel).findByText(/Written by you/)).toBeInTheDocument();
    expect(db.postBySlug(DRAFT)?.tldr).toMatchObject({
      state: 'MANUAL',
      summary: 'Order layers by how often they change.',
    });
  });

  it('refuses to overwrite changes made elsewhere (409) and explains', async () => {
    await signInAs('demo');
    const { user } = renderApp(`/write/${DRAFT}`);
    const title = await screen.findByLabelText('Title');
    db.postBySlug(DRAFT)!.version += 1; // someone saved in another tab meanwhile
    await user.type(title, ' (v2)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/This post was changed somewhere else/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load latest version' })).toBeInTheDocument();
    expect(db.postBySlug(DRAFT)?.title).toBe('Notes on container image layers');
  });

  it('deletes after confirmation', async () => {
    await signInAs('demo');
    const { user, router } = renderApp(`/write/${DRAFT}`);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this post?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete post' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
    expect(db.postBySlug(DRAFT)).toBeUndefined();
  });

  it('asks before leaving with unsaved changes', async () => {
    await signInAs('demo');
    const { user, router } = renderApp(`/write/${DRAFT}`);
    await user.type(await screen.findByLabelText('Title'), '!');
    await user.click(screen.getByRole('link', { name: 'Posts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe(`/write/${DRAFT}`);
    await user.click(screen.getByRole('link', { name: 'Posts' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Leave without saving?' })).getByRole(
        'button',
        { name: 'Leave' },
      ),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
  });

  it('shows someone else’s post as not found', async () => {
    await signInAs('bob');
    renderApp(`/write/${DRAFT}`);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('lists the author’s posts with drafts, filterable by status', async () => {
    await signInAs('demo');
    const { user } = renderApp('/dashboard');
    const table = await screen.findByRole('table', { name: 'Your posts' });
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 posts
    expect(
      within(table).getByRole('link', { name: 'Preview “Notes on container image layers”' }),
    ).toHaveAttribute('href', `/posts/${DRAFT}?preview=1`);
    await user.click(screen.getByRole('link', { name: 'Published' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('table', { name: 'Your posts' })).getAllByRole('row'),
      ).toHaveLength(2);
    });
  });
});

describe('settings', () => {
  it('updates the profile', async () => {
    await signInAs('demo');
    const { user } = renderApp('/settings');
    const name = await screen.findByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Dee');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dee' })).toBeInTheDocument(); // header follows
  });

  it('changes the password and stays signed in, although the server revoked all sessions', async () => {
    await signInAs('demo');
    const { user } = renderApp('/settings');
    await user.type(await screen.findByLabelText('Current password'), 'demo-password');
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(db.userByUsername('demo')?.password).toBe('a brand new passphrase');
  });

  it('shows a wrong current password next to the field', async () => {
    await signInAs('demo');
    const { user } = renderApp('/settings');
    await user.type(await screen.findByLabelText('Current password'), 'not-my-password');
    await user.type(screen.getByLabelText('New password'), 'a brand new passphrase');
    await user.type(screen.getByLabelText('Confirm new password'), 'a brand new passphrase');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
  });
});

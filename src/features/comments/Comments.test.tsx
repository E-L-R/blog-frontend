import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { renderApp, signInAs } from '../../test/renderApp.tsx';
import { server } from '../../test/server.ts';

const RECORDS = '/posts/why-we-replaced-our-data-classes-with-java-records';

async function commentsRegion() {
  return screen.findByRole('region', { name: /Comments \(\d+\)/ });
}

describe('comments', () => {
  it('asks anonymous readers to sign in, coming back to the discussion', async () => {
    renderApp(RECORDS);
    const region = await commentsRegion();
    expect(within(region).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`${RECORDS}#comments`)}`,
    );
    expect(within(region).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('posts a comment and updates the count', async () => {
    await signInAs('demo');
    const { user } = renderApp(RECORDS);
    expect(await screen.findByRole('heading', { name: 'Comments (2)' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Add a comment'), 'Great write-up!');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(await screen.findByRole('heading', { name: 'Comments (3)' })).toBeInTheDocument();
    expect(screen.getByText('Great write-up!')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toHaveValue('');
  });

  it('validates before sending', async () => {
    await signInAs('demo');
    const { user } = renderApp(RECORDS);
    await user.click(await screen.findByRole('button', { name: 'Post comment' }));
    expect(await screen.findByText('Write something first.')).toBeInTheDocument();
  });

  it('lets authors edit their own comment', async () => {
    await signInAs('bob');
    const { user } = renderApp(RECORDS);
    const bobs = await screen.findByRole('article', { name: 'Comment by Bob Okafor' });
    await user.click(within(bobs).getByRole('button', { name: 'Edit' }));
    const field = within(bobs).getByLabelText('Edit your comment');
    await user.clear(field);
    await user.type(field, 'Did Jackson handle records well for you?');
    await user.click(within(bobs).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Did Jackson handle records well for you?')).toBeInTheDocument();
    expect(
      within(await screen.findByRole('article', { name: 'Comment by Bob Okafor' })).getByText(
        '(edited)',
      ),
    ).toBeInTheDocument();
  });

  it('follows the moderation matrix: the post’s author may delete, but not edit, others’ comments', async () => {
    await signInAs('alice'); // author of the post
    const { user } = renderApp(RECORDS);
    const bobs = await screen.findByRole('article', { name: 'Comment by Bob Okafor' });
    expect(within(bobs).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    await user.click(within(bobs).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete comment' }));
    expect(await screen.findByText('This comment was deleted.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Comments (1)' })).toBeInTheDocument();
  });

  it('shows other readers no moderation buttons', async () => {
    await signInAs('demo');
    renderApp(RECORDS);
    const bobs = await screen.findByRole('article', { name: 'Comment by Bob Okafor' });
    expect(within(bobs).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the text when posting fails', async () => {
    await signInAs('demo');
    server.use(
      http.post('*/api/v1/posts/:slug/comments', () =>
        HttpResponse.json(
          { type: 'x#rate-limited', title: 'Too many requests', status: 429 },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    );
    const { user } = renderApp(RECORDS);
    await user.type(await screen.findByLabelText('Add a comment'), 'Keep me');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Please try again in 30 seconds.',
    );
    expect(screen.getByLabelText('Add a comment')).toHaveValue('Keep me');
  });
});

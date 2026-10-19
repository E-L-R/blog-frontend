import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp.tsx';
import { db, server } from '../../test/server.ts';

const postTitles = async () =>
  (await screen.findAllByRole('heading', { level: 2 })).map((heading) => heading.textContent);

describe('HomePage', () => {
  it('lists the latest published posts, newest first', async () => {
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Latest posts', level: 1 }),
    ).toBeInTheDocument();
    const titles = await postTitles();
    expect(titles[0]).toBe('Attention, explained one matrix at a time');
    expect(titles).not.toContain('Notes on container image layers'); // a draft
  });

  it('shows the TL;DR instead of the excerpt, marking model-written ones as AI', async () => {
    renderApp('/');
    const card = (
      await screen.findByRole('link', { name: 'Building a BPE tokenizer from scratch' })
    ).closest('article');
    expect(within(card!).getByText('TL;DR (AI):')).toBeInTheDocument();
  });

  it('searches, with the query in the URL', async () => {
    const { user, router } = renderApp('/');
    await screen.findAllByRole('heading', { level: 2 });
    await user.type(screen.getByRole('searchbox', { name: 'Search posts' }), 'tokenizer');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByRole('heading', { name: 'Results for “tokenizer”', level: 1 }),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await postTitles()).toEqual(['Building a BPE tokenizer from scratch']);
    });
    expect(router.state.location.search).toBe('?q=tokenizer');
  });

  it('filters by tag from a tag link', async () => {
    const { user } = renderApp('/');
    const card = (
      await screen.findByRole('link', { name: 'Building a BPE tokenizer from scratch' })
    ).closest('article');
    await user.click(within(card!).getByRole('link', { name: '#Python' }));
    expect(
      await screen.findByRole('heading', { name: 'Posts tagged #Python', level: 1 }),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await postTitles()).toEqual(['Building a BPE tokenizer from scratch']);
    });
  });

  it('says so when nothing matches', async () => {
    renderApp('/?q=kubernetes');
    expect(
      await screen.findByText('No posts match. Try other words or another tag.'),
    ).toBeInTheDocument();
  });

  it('pages through long lists', async () => {
    for (let i = 0; i < 12; i++) {
      db.state.posts.push({
        ...db.state.posts[0]!,
        id: crypto.randomUUID(),
        slug: `extra-${i}`,
        title: `Extra post ${i}`,
        publishedAt: new Date(Date.UTC(2020, 0, i + 1)).toISOString(),
      });
    }
    const { user } = renderApp('/');
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Older →' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Extra post 0' })).toBeInTheDocument();
  });

  it('offers a retry when the server fails, with a reference for support', async () => {
    let failures = 1;
    server.use(
      http.get('*/api/v1/posts', () =>
        failures-- > 0
          ? HttpResponse.json(
              { status: 503 },
              { status: 503, headers: { 'X-Trace-Id': 'trace-123' } },
            )
          : undefined,
      ),
    );
    const { user } = renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('report reference trace-123');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('link', { name: 'Building a BPE tokenizer from scratch' }),
    ).toBeInTheDocument();
  });
});

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type SubmitEvent, useId } from 'react';
import { Link, useSearchParams } from 'react-router';
import { type PostQuery, postsApi } from '../../api/endpoints.ts';
import { keys } from '../../api/queryKeys.ts';
import { limits } from '../../api/schemas.ts';
import { Button } from '../../components/Button.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { pageFromSearch } from '../../lib/paging.ts';
import { EmptyState, ErrorState, LoadingState } from '../../components/States.tsx';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { PostCard } from './PostCard.tsx';
import styles from './posts.module.css';

export const POSTS_PAGE_SIZE = 10;

/** The front page: latest published posts, with search, tag filter and pagination in the URL. */
export function HomePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const tag = params.get('tag')?.trim() ?? '';
  const page = pageFromSearch(params);
  const query: PostQuery = {
    q: q || undefined,
    tag: tag || undefined,
    page: page - 1,
    size: POSTS_PAGE_SIZE,
  };

  const posts = useQuery({
    queryKey: keys.posts.list(query),
    queryFn: ({ signal }) => postsApi.list(query, signal),
    placeholderData: keepPreviousData, // no flash of "loading" between pages
  });

  // The URL has the tag's slug ("machine-learning"); the posts know its name ("Machine Learning").
  const tagName =
    posts.data?.content.flatMap((post) => post.tags).find((t) => t.slug === tag)?.name ?? tag;
  const heading = q ? `Results for “${q}”` : tag ? `Posts tagged #${tagName}` : 'Latest posts';
  useDocumentTitle(q || tag ? heading : null);

  function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('q');
    const next = new URLSearchParams(params);
    next.delete('page');
    if (typeof value === 'string' && value.trim()) {
      next.set('q', value.trim());
    } else {
      next.delete('q');
    }
    setParams(next);
  }

  return (
    <section>
      <div className={styles.toolbar}>
        <h1>{heading}</h1>
        <SearchForm key={q} defaultValue={q} onSubmit={search} />
      </div>
      {tag && (
        <p className={styles.filter}>
          Showing posts tagged <strong>#{tagName}</strong>. <Link to="/">Show all posts</Link>
        </p>
      )}
      {posts.isPending ? (
        <LoadingState label="Loading posts…" />
      ) : posts.isError ? (
        <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
      ) : posts.data.content.length === 0 ? (
        <EmptyState>
          {q || tag ? 'No posts match. Try other words or another tag.' : 'Nothing published yet.'}
        </EmptyState>
      ) : (
        <>
          <ul className={styles.list} aria-busy={posts.isPlaceholderData}>
            {posts.data.content.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
          <Pagination page={page} totalPages={posts.data.totalPages} />
        </>
      )}
    </section>
  );
}

function SearchForm({
  defaultValue,
  onSubmit,
}: {
  defaultValue: string;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const id = useId();
  return (
    <form role="search" className={styles.search} onSubmit={onSubmit}>
      <label htmlFor={id} className="visually-hidden">
        Search posts
      </label>
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={limits.searchQueryMax}
        placeholder="Search posts"
      />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

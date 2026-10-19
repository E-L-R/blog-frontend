import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { type MyPostQuery, myPostsApi } from '../../api/endpoints.ts';
import { keys } from '../../api/queryKeys.ts';
import type { PostStatus, PostSummary, TldrState } from '../../api/schemas.ts';
import { buttonClass } from '../../components/buttonClass.ts';
import { Pagination } from '../../components/Pagination.tsx';
import { pageFromSearch } from '../../lib/paging.ts';
import { EmptyState, ErrorState, LoadingState } from '../../components/States.tsx';
import { Time } from '../../components/Time.tsx';
import ui from '../../components/ui.module.css';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import styles from './dashboard.module.css';

const FILTERS: { label: string; status: PostStatus | undefined }[] = [
  { label: 'All', status: undefined },
  { label: 'Drafts', status: 'DRAFT' },
  { label: 'Published', status: 'PUBLISHED' },
];

const TLDR_LABEL: Record<TldrState, string> = {
  NONE: '—',
  PENDING: 'Being written',
  READY: 'AI',
  FAILED: 'Failed',
  MANUAL: 'Yours',
};

function statusFromSearch(value: string | null): PostStatus | undefined {
  return value === 'DRAFT' || value === 'PUBLISHED' ? value : undefined;
}

/** The author's posts, drafts included, most recently changed first. */
export function DashboardPage() {
  useDocumentTitle('My posts');
  const [params] = useSearchParams();
  const status = statusFromSearch(params.get('status'));
  const page = pageFromSearch(params);
  const query: MyPostQuery = { status, page: page - 1, size: 20 };

  const posts = useQuery({
    queryKey: keys.myPosts.list(query),
    queryFn: ({ signal }) => myPostsApi.list(query, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <section>
      <div className={styles.toolbar}>
        <h1>My posts</h1>
        <Link to="/write" className={buttonClass('primary')}>
          Write a new post
        </Link>
      </div>
      <nav className={styles.filters} aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            to={filter.status ? `/dashboard?status=${filter.status}` : '/dashboard'}
            className={styles.filter}
            aria-current={filter.status === status ? 'page' : undefined}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      {posts.isPending ? (
        <LoadingState label="Loading your posts…" />
      ) : posts.isError ? (
        <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
      ) : posts.data.content.length === 0 ? (
        <EmptyState>
          {status === 'DRAFT'
            ? 'No drafts.'
            : status === 'PUBLISHED'
              ? 'Nothing published yet.'
              : 'You haven’t written anything yet.'}{' '}
          <Link to="/write">Write your first post</Link>.
        </EmptyState>
      ) : (
        <>
          <table className={styles.table}>
            <caption className="visually-hidden">Your posts</caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">TL;DR</th>
                <th scope="col">Published</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {posts.data.content.map((post) => (
                <PostRow key={post.id} post={post} />
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={posts.data.totalPages} />
        </>
      )}
    </section>
  );
}

function PostRow({ post }: { post: PostSummary }) {
  const slug = encodeURIComponent(post.slug);
  return (
    <tr>
      <td>
        <Link to={`/write/${slug}`}>{post.title}</Link>
      </td>
      <td>
        <span className={ui.badge}>{post.status === 'DRAFT' ? 'Draft' : 'Published'}</span>
      </td>
      <td>{TLDR_LABEL[post.tldr.state]}</td>
      <td>{post.publishedAt ? <Time iso={post.publishedAt} /> : '—'}</td>
      <td className={styles.rowActions}>
        <Link
          to={post.status === 'DRAFT' ? `/posts/${slug}?preview=1` : `/posts/${slug}`}
          aria-label={`${post.status === 'DRAFT' ? 'Preview' : 'View'} “${post.title}”`}
        >
          {post.status === 'DRAFT' ? 'Preview' : 'View'}
        </Link>
      </td>
    </tr>
  );
}

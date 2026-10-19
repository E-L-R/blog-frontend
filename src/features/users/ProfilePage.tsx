import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import { postsApi, usersApi } from '../../api/endpoints.ts';
import { ApiError } from '../../api/errors.ts';
import { keys } from '../../api/queryKeys.ts';
import { NotFoundPage } from '../../app/ErrorPages.tsx';
import { Pagination } from '../../components/Pagination.tsx';
import { pageFromSearch } from '../../lib/paging.ts';
import { EmptyState, ErrorState, LoadingState } from '../../components/States.tsx';
import { Time } from '../../components/Time.tsx';
import { displayName, plural } from '../../lib/format.ts';
import { useDocumentTitle, useMetaDescription } from '../../lib/useDocumentTitle.ts';
import { POSTS_PAGE_SIZE } from '../posts/HomePage.tsx';
import { PostCard } from '../posts/PostCard.tsx';
import styles from '../posts/posts.module.css';

export function ProfilePage() {
  const { username = '' } = useParams();
  const [params] = useSearchParams();
  const page = pageFromSearch(params);

  const profile = useQuery({
    queryKey: keys.users.profile(username),
    queryFn: ({ signal }) => usersApi.profile(username, signal),
  });
  const query = { author: username, page: page - 1, size: POSTS_PAGE_SIZE };
  const posts = useQuery({
    queryKey: keys.posts.list(query),
    queryFn: ({ signal }) => postsApi.list(query, signal),
    enabled: profile.isSuccess,
    placeholderData: keepPreviousData,
  });

  useDocumentTitle(profile.data ? displayName(profile.data) : null);
  useMetaDescription(profile.data?.bio);

  if (profile.isPending) {
    return <LoadingState label="Loading profile…" />;
  }
  if (profile.isError) {
    return profile.error instanceof ApiError && profile.error.isNotFound ? (
      <NotFoundPage message={`There is no user called “${username}”.`} />
    ) : (
      <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
    );
  }

  const user = profile.data;
  return (
    <section>
      <header className={styles.articleHeader}>
        <h1>{displayName(user)}</h1>
        <p className={styles.meta}>
          <span>@{user.username}</span>
          <span>
            Joined <Time iso={user.joinedAt} />
          </span>
          <span>{plural(user.publishedPostCount, 'published post')}</span>
        </p>
        {user.bio && <p>{user.bio}</p>}
      </header>
      <h2>Posts</h2>
      {posts.isPending ? (
        <LoadingState label="Loading posts…" />
      ) : posts.isError ? (
        <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
      ) : posts.data.content.length === 0 ? (
        <EmptyState>No published posts yet.</EmptyState>
      ) : (
        <>
          <ul className={styles.list}>
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

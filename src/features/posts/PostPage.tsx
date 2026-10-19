import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { myPostsApi, postsApi } from '../../api/endpoints.ts';
import { ApiError } from '../../api/errors.ts';
import { keys } from '../../api/queryKeys.ts';
import { NotFoundPage } from '../../app/ErrorPages.tsx';
import { useAuth } from '../../auth/authContext.ts';
import { canManagePost } from '../../auth/permissions.ts';
import { Alert } from '../../components/Alert.tsx';
import { buttonClass } from '../../components/buttonClass.ts';
import { ErrorState, LoadingState } from '../../components/States.tsx';
import { TagList } from '../../components/TagList.tsx';
import { sanitizeHtml } from '../../lib/sanitize.ts';
import { useDocumentTitle, useMetaDescription } from '../../lib/useDocumentTitle.ts';
import { CommentsSection } from '../comments/CommentsSection.tsx';
import { tldrRefetchInterval } from '../tldr/polling.ts';
import { TldrSummary } from '../tldr/TldrSummary.tsx';
import { PostMeta } from './PostCard.tsx';
import styles from './posts.module.css';

export function PostPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const { status, user } = useAuth();
  // `?preview=1`: the author's own view, which includes drafts (public URLs only show published posts).
  const preview = params.get('preview') === '1' && status === 'authenticated';

  const post = useQuery({
    queryKey: preview ? keys.myPosts.detail(slug) : keys.posts.detail(slug),
    queryFn: ({ signal }) => (preview ? myPostsApi.get(slug, signal) : postsApi.get(slug, signal)),
    enabled: status !== 'loading' || params.get('preview') !== '1',
    refetchInterval: tldrRefetchInterval,
  });

  const html = useMemo(() => (post.data ? sanitizeHtml(post.data.contentHtml) : ''), [post.data]);
  useDocumentTitle(post.data?.title);
  useMetaDescription(post.data?.tldr.summary ?? post.data?.excerpt);
  useScrollToHash(post.isSuccess);

  if (post.isPending) {
    return <LoadingState label="Loading post…" />;
  }
  if (post.isError) {
    if (post.error instanceof ApiError && post.error.isNotFound) {
      return (
        <NotFoundPage message="This post doesn't exist, or it isn't published. Your own drafts are under “My posts”." />
      );
    }
    return <ErrorState error={post.error} onRetry={() => void post.refetch()} />;
  }

  const data = post.data;
  const manageable = canManagePost(user, data.author.username);
  const isDraft = data.status === 'DRAFT';

  return (
    <article className={styles.article}>
      {isDraft && (
        <div className={styles.draftNotice}>
          <Alert tone="warning">
            <p>This is a draft preview. Only you can see it.</p>
          </Alert>
        </div>
      )}
      <header className={styles.articleHeader}>
        <h1>{data.title}</h1>
        <PostMeta post={data} />
        <TagList tags={data.tags} />
        {manageable && (
          <p>
            <Link
              to={`/write/${encodeURIComponent(data.slug)}`}
              className={buttonClass('secondary', 'small')}
            >
              Edit post
            </Link>
          </p>
        )}
      </header>
      <TldrSummary tldr={data.tldr} />
      {/* Sanitized twice: by blog-backend when rendering the Markdown, and here before injecting. */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      {!isDraft && (
        <CommentsSection
          slug={data.slug}
          postAuthor={data.author.username}
          commentCount={data.commentCount}
        />
      )}
    </article>
  );
}

/** `/posts/x#comments` (from "Sign in to comment") should land on the comments once they render. */
function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (ready && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }
  }, [ready]);
}

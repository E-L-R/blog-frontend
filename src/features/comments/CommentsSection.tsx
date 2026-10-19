import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { commentsApi } from '../../api/endpoints.ts';
import { userMessage } from '../../api/errors.ts';
import { keys } from '../../api/queryKeys.ts';
import { useAuth } from '../../auth/authContext.ts';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { ErrorState, LoadingState } from '../../components/States.tsx';
import { CommentForm } from './CommentForm.tsx';
import { CommentItem } from './CommentItem.tsx';
import styles from './comments.module.css';

export const COMMENTS_PAGE_SIZE = 20;

/** Oldest first (the server decides the order), loaded page by page. */
export function CommentsSection({
  slug,
  postAuthor,
  commentCount,
}: {
  slug: string;
  postAuthor: string;
  /** The post's count of visible comments (deleted ones keep their place in the list but don't count). */
  commentCount: number;
}) {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const comments = useInfiniteQuery({
    queryKey: keys.comments(slug),
    queryFn: ({ pageParam, signal }) =>
      commentsApi.list(slug, { page: pageParam, size: COMMENTS_PAGE_SIZE }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
  });

  // Comment counts appear on the post and in every list.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.comments(slug) }),
      queryClient.invalidateQueries({ queryKey: keys.posts.all }),
    ]);

  const create = useMutation({
    mutationFn: (content: string) => commentsApi.create(slug, content),
    onSuccess: refresh,
  });

  const listed = comments.data?.pages[0]?.totalElements;

  return (
    <section id="comments" className={styles.section} aria-labelledby="comments-heading">
      <h2 id="comments-heading">Comments ({commentCount})</h2>
      {comments.isPending ? (
        <LoadingState label="Loading comments…" />
      ) : comments.isError ? (
        <ErrorState error={comments.error} onRetry={() => void comments.refetch()} />
      ) : listed === 0 ? (
        <p>No comments yet. Start the discussion!</p>
      ) : (
        <>
          <ul className={styles.list}>
            {comments.data.pages
              .flatMap((page) => page.content)
              .map((comment) => (
                <li key={comment.id}>
                  <CommentItem comment={comment} postAuthor={postAuthor} onChanged={refresh} />
                </li>
              ))}
          </ul>
          {comments.hasNextPage && (
            <Button
              variant="secondary"
              busy={comments.isFetchingNextPage}
              onClick={() => void comments.fetchNextPage()}
            >
              Load more comments
            </Button>
          )}
        </>
      )}
      {status === 'authenticated' ? (
        <>
          {create.isError && (
            <Alert tone="error">
              <p>{userMessage(create.error)}</p>
            </Alert>
          )}
          <CommentForm
            label="Add a comment"
            submitLabel="Post comment"
            busy={create.isPending}
            onSubmit={(content) => create.mutateAsync(content)}
          />
        </>
      ) : status === 'anonymous' ? (
        <p>
          <Link to={`/login?next=${encodeURIComponent(`/posts/${slug}#comments`)}`}>Sign in</Link>{' '}
          to join the discussion.
        </p>
      ) : null}
    </section>
  );
}

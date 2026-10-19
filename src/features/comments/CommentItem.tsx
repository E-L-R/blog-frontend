import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { commentsApi } from '../../api/endpoints.ts';
import { userMessage } from '../../api/errors.ts';
import type { CommentView } from '../../api/schemas.ts';
import { useAuth } from '../../auth/authContext.ts';
import { canDeleteComment, canEditComment } from '../../auth/permissions.ts';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { Time } from '../../components/Time.tsx';
import { displayName } from '../../lib/format.ts';
import { CommentForm } from './CommentForm.tsx';
import styles from './comments.module.css';

export function CommentItem({
  comment,
  postAuthor,
  onChanged,
}: {
  comment: CommentView;
  postAuthor: string;
  onChanged: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const update = useMutation({
    mutationFn: (content: string) => commentsApi.update(comment.id, content),
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => commentsApi.remove(comment.id),
    onSuccess: async () => {
      setConfirming(false);
      await onChanged();
    },
  });

  if (comment.deleted || !comment.author) {
    return (
      <article className={`${styles.comment} ${styles.deleted}`}>
        <p className={styles.content}>This comment was deleted.</p>
      </article>
    );
  }

  const author = comment.author;
  const error = update.error ?? remove.error;

  return (
    <article className={styles.comment} aria-label={`Comment by ${displayName(author)}`}>
      <p className={styles.header}>
        <Link to={`/u/${encodeURIComponent(author.username)}`}>{displayName(author)}</Link>
        <Time iso={comment.createdAt} relative />
        {comment.edited && <span>(edited)</span>}
      </p>
      {error && (
        <Alert tone="error">
          <p>{userMessage(error)}</p>
        </Alert>
      )}
      {editing ? (
        <CommentForm
          label="Edit your comment"
          submitLabel="Save"
          defaultValue={comment.content ?? ''}
          busy={update.isPending}
          onSubmit={(content) => update.mutateAsync(content)}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : (
        <p className={styles.content}>{comment.content}</p>
      )}
      {!editing && (
        <div className={styles.actions}>
          {canEditComment(user, comment) && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
          {canDeleteComment(user, comment, postAuthor) && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Delete this comment?"
        confirmLabel="Delete comment"
        danger
        busy={remove.isPending}
        onConfirm={() => {
          remove.mutate();
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      >
        <p>The text is erased for good. The comment's place stays, marked as deleted.</p>
      </ConfirmDialog>
    </article>
  );
}

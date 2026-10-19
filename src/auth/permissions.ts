import type { CommentView, PrivateUserProfile } from '../api/schemas.ts';

/**
 * Mirrors blog-backend's authorization rules, only to decide which buttons to show. The server
 * enforces them (PostAuthz #29, CommentAuthz #37); hiding a button is never the security boundary.
 */

type Viewer = Pick<PrivateUserProfile, 'username' | 'role'> | null;

const isAdmin = (viewer: Viewer) => viewer?.role === 'ADMIN';

/** Edit, delete, publish, and manage the TL;DR: the author and admins. */
export function canManagePost(viewer: Viewer, authorUsername: string): boolean {
  return viewer !== null && (viewer.username === authorUsername || isAdmin(viewer));
}

/** Editing someone else's words would put words in their mouth: only the comment's author. */
export function canEditComment(viewer: Viewer, comment: CommentView): boolean {
  return viewer !== null && !comment.deleted && comment.author?.username === viewer.username;
}

/** The comment's author, the post's author (moderates their own discussion), and admins. */
export function canDeleteComment(
  viewer: Viewer,
  comment: CommentView,
  postAuthorUsername: string,
): boolean {
  if (viewer === null || comment.deleted) {
    return false;
  }
  return (
    comment.author?.username === viewer.username ||
    viewer.username === postAuthorUsername ||
    isAdmin(viewer)
  );
}

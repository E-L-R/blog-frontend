import type { Query } from '@tanstack/react-query';
import type { PostDetail } from '../../api/schemas.ts';

/** Poll every 3 s, for at most ~3 minutes, while the model is writing a TL;DR. */
export const TLDR_POLL_MS = 3000;
const MAX_POLLS = 60;

export function tldrRefetchInterval(query: Query<PostDetail>) {
  const pending = query.state.data?.tldr.state === 'PENDING';
  return pending && query.state.dataUpdateCount < MAX_POLLS ? TLDR_POLL_MS : false;
}

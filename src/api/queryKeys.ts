import type { MyPostQuery, PostQuery } from './endpoints.ts';

/**
 * Every TanStack Query key in one place. Hierarchical, so `invalidateQueries({ queryKey: keys.posts.all })`
 * refreshes every post list and detail at once.
 */
export const keys = {
  me: ['me'] as const,
  posts: {
    all: ['posts'] as const,
    list: (query: PostQuery) => ['posts', 'list', query] as const,
    detail: (slug: string) => ['posts', 'detail', slug] as const,
  },
  myPosts: {
    all: ['my-posts'] as const,
    list: (query: MyPostQuery) => ['my-posts', 'list', query] as const,
    detail: (slug: string) => ['my-posts', 'detail', slug] as const,
  },
  comments: (slug: string) => ['comments', slug] as const,
  users: { profile: (username: string) => ['users', username] as const },
  tags: ['tags'] as const,
};

/** Private data (only the signed-in user may see it): dropped from the cache on sign-out. */
export const privateKeys = [keys.me, keys.myPosts.all] as const;

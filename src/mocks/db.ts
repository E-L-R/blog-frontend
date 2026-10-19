import type {
  CommentView,
  PostDetail,
  PostStatus,
  PostSummary,
  PrivateUserProfile,
  PublicUserProfile,
  Role,
  TldrState,
  TldrView,
} from '../api/schemas.ts';
import { markdownToText, renderMarkdown } from '../lib/markdown.ts';
import { createSeed } from './seed.ts';
import { slugify } from './slug.ts';

/**
 * In-memory data behind the demo API, shaped like blog-backend's tables. Persisted to localStorage in
 * the browser (so the demo survives reloads), fresh per test.
 */

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password: string; // demo only: the real backend stores Argon2/bcrypt hashes
  displayName: string;
  bio: string | null;
  role: Role;
  createdAt: string;
}

export interface DbTldr {
  state: TldrState;
  summary: string | null;
  /** When the simulated model "finishes" a PENDING TL;DR (epoch ms). */
  readyAt: number | null;
}

export interface DbPost {
  id: string;
  slug: string;
  title: string;
  contentMarkdown: string;
  authorId: string;
  status: PostStatus;
  tags: { name: string; slug: string }[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  tldr: DbTldr;
}

export interface DbComment {
  id: string;
  postId: string;
  authorId: string;
  content: string | null;
  deleted: boolean;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbRefreshToken {
  token: string;
  userId: string;
  familyId: string;
  revoked: boolean;
  expiresAt: number;
}

export interface DbAccessToken {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface DbState {
  users: DbUser[];
  posts: DbPost[];
  comments: DbComment[];
  refreshTokens: DbRefreshToken[];
  accessTokens: DbAccessToken[];
}

export interface MockDbOptions {
  now?: () => number;
  /** How long the simulated model takes to write a TL;DR. */
  tldrDelayMs?: number;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Start empty instead of with the sample content. */
  empty?: boolean;
}

export const DEMO_DB_KEY = 'blog.demo.db.v1';

export class MockDb {
  state: DbState;
  readonly now: () => number;
  readonly tldrDelayMs: number;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly #storage: MockDbOptions['storage'];

  constructor(options: MockDbOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.tldrDelayMs = options.tldrDelayMs ?? 4000;
    this.accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 15 * 60;
    this.refreshTokenTtlSeconds = options.refreshTokenTtlSeconds ?? 7 * 24 * 3600;
    this.#storage = options.storage ?? null;
    this.state = this.#load() ?? (options.empty ? emptyState() : createSeed(this.now()));
  }

  save(): void {
    try {
      this.#storage?.setItem(DEMO_DB_KEY, JSON.stringify(this.state));
    } catch {
      // storage full or unavailable: the demo just won't survive a reload
    }
  }

  reset(): void {
    this.#storage?.removeItem(DEMO_DB_KEY);
    this.state = createSeed(this.now());
  }

  #load(): DbState | null {
    try {
      const raw = this.#storage?.getItem(DEMO_DB_KEY);
      return raw ? (JSON.parse(raw) as DbState) : null;
    } catch {
      return null;
    }
  }

  isoNow(): string {
    return new Date(this.now()).toISOString();
  }

  // ---- lookups ----------------------------------------------------------------------------

  userById(id: string): DbUser | undefined {
    return this.state.users.find((user) => user.id === id);
  }

  userByUsername(username: string): DbUser | undefined {
    const wanted = username.toLowerCase();
    return this.state.users.find((user) => user.username.toLowerCase() === wanted);
  }

  userByLogin(login: string): DbUser | undefined {
    const wanted = login.trim().toLowerCase();
    return this.state.users.find(
      (user) => user.username.toLowerCase() === wanted || user.email.toLowerCase() === wanted,
    );
  }

  postBySlug(slug: string): DbPost | undefined {
    return this.state.posts.find((post) => post.slug === slug);
  }

  // ---- the simulated TL;DR model ----------------------------------------------------------

  /** Finishes PENDING TL;DRs whose time has come (the real backend has a background worker). */
  settleTldr(post: DbPost): void {
    if (
      post.tldr.state === 'PENDING' &&
      post.tldr.readyAt !== null &&
      this.now() >= post.tldr.readyAt
    ) {
      post.tldr = { state: 'READY', summary: summarize(post.contentMarkdown), readyAt: null };
      this.save();
    }
  }

  requestTldr(post: DbPost): void {
    post.tldr = {
      state: 'PENDING',
      summary: post.tldr.summary, // the previous summary stays visible while a new one is written
      readyAt: this.now() + this.tldrDelayMs,
    };
  }

  // ---- views (the JSON the API returns) ---------------------------------------------------

  authorRef(userId: string) {
    const user = this.userById(userId);
    return { username: user?.username ?? 'unknown', displayName: user?.displayName ?? null };
  }

  tldrView(post: DbPost): TldrView {
    return { state: post.tldr.state, summary: post.tldr.summary };
  }

  commentCount(postId: string): number {
    return this.state.comments.filter((comment) => comment.postId === postId && !comment.deleted)
      .length;
  }

  postSummary(post: DbPost): PostSummary {
    this.settleTldr(post);
    const text = markdownToText(post.contentMarkdown);
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text,
      readingTimeMinutes: Math.max(1, Math.round(text.split(' ').filter(Boolean).length / 200)),
      commentCount: this.commentCount(post.id),
      tldr: this.tldrView(post),
      author: this.authorRef(post.authorId),
      tags: post.tags,
      status: post.status,
      publishedAt: post.publishedAt,
    };
  }

  postDetail(post: DbPost): PostDetail {
    return {
      ...this.postSummary(post),
      contentMarkdown: post.contentMarkdown,
      contentHtml: renderMarkdown(post.contentMarkdown),
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      version: post.version,
    };
  }

  commentView(comment: DbComment): CommentView {
    if (comment.deleted) {
      return {
        id: comment.id,
        author: null,
        content: null,
        edited: false,
        deleted: true,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    }
    return {
      id: comment.id,
      author: this.authorRef(comment.authorId),
      content: comment.content,
      edited: comment.edited,
      deleted: false,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  privateProfile(user: DbUser): PrivateUserProfile {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      role: user.role,
      joinedAt: user.createdAt,
    };
  }

  publicProfile(user: DbUser): PublicUserProfile {
    return {
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      joinedAt: user.createdAt,
      publishedPostCount: this.state.posts.filter(
        (post) => post.authorId === user.id && post.status === 'PUBLISHED',
      ).length,
    };
  }

  // ---- writes -----------------------------------------------------------------------------

  addUser(input: {
    username: string;
    email: string;
    password: string;
    displayName?: string | null;
    role?: Role;
    bio?: string | null;
  }): DbUser {
    const user: DbUser = {
      id: crypto.randomUUID(),
      username: input.username,
      email: input.email,
      password: input.password,
      displayName: input.displayName?.trim() ? input.displayName.trim() : input.username,
      bio: input.bio ?? null,
      role: input.role ?? 'USER',
      createdAt: this.isoNow(),
    };
    this.state.users.push(user);
    this.save();
    return user;
  }

  uniqueSlug(title: string): string {
    const base = slugify(title) || 'post';
    let slug = base;
    for (let n = 2; this.postBySlug(slug); n++) {
      slug = `${base}-${n}`;
    }
    return slug;
  }
}

function emptyState(): DbState {
  return { users: [], posts: [], comments: [], refreshTokens: [], accessTokens: [] };
}

/**
 * The demo's stand-in for the language model: the first sentences of the post. The real summaries
 * come from E-L-R/blog-tldr-model.
 */
export function summarize(markdown: string): string {
  const text = markdownToText(markdown);
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let summary = '';
  for (const sentence of sentences) {
    if ((summary + sentence).length > 280) {
      break;
    }
    summary += sentence;
    if (summary.length > 120) {
      break;
    }
  }
  return (summary || text.slice(0, 277) + '…').trim();
}

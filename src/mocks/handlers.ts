import { http, HttpResponse } from 'msw/http';
import { delay } from 'msw/utils/delay';
import { limits, type PostStatus } from '../api/schemas.ts';
import type { DbComment, DbPost, DbUser, MockDb } from './db.ts';
import { slugify } from './slug.ts';

/**
 * A stand-in for blog-backend's `/api/v1`, used by demo mode and by the tests. It follows the planned
 * contract (contract/openapi.json) and the backend's rules: problem details with stable `type` URIs,
 * authorization matrices, optimistic locking, rotating refresh tokens with reuse detection, sorting
 * allow-lists, page-size limits, and a simulated model writing TL;DRs in the background.
 */

const API = '*/api/v1';
const PROBLEM_BASE = 'https://github.com/E-L-R/blog-backend/blob/main/docs/problems.md#';

type Kind =
  | 'validation'
  | 'bad-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limited';

interface FieldViolation {
  field: string;
  message: string;
}

const TITLES: Record<Kind, string> = {
  validation: 'Validation failed',
  'bad-request': 'Bad request',
  unauthorized: 'Unauthorized',
  forbidden: 'Forbidden',
  'not-found': 'Not found',
  conflict: 'Conflict',
  'rate-limited': 'Too many requests',
};

function traceId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

type JsonBody = Parameters<typeof HttpResponse.json>[0];

function json(body: JsonBody, status = 200, headers: Record<string, string> = {}) {
  return HttpResponse.json(body, { status, headers: { 'X-Trace-Id': traceId(), ...headers } });
}

function noContent() {
  return new HttpResponse(null, { status: 204, headers: { 'X-Trace-Id': traceId() } });
}

export function problem(
  status: number,
  kind: Kind,
  detail: string,
  extra: { errors?: FieldViolation[]; headers?: Record<string, string> } = {},
) {
  return HttpResponse.json(
    {
      type: PROBLEM_BASE + kind,
      title: TITLES[kind],
      status,
      detail,
      ...(extra.errors ? { errors: extra.errors } : {}),
    },
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Trace-Id': traceId(),
        ...extra.headers,
      },
    },
  );
}

class Failure extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super('mock API failure');
    this.response = response;
  }
}

const fail = (response: Response): never => {
  throw new Failure(response);
};

const notFound = (what: string) => fail(problem(404, 'not-found', `${what} not found.`));
const forbidden = () => fail(problem(403, 'forbidden', 'You are not allowed to do that.'));
const invalid = (errors: FieldViolation[]) =>
  fail(problem(400, 'validation', 'One or more fields are invalid.', { errors }));

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return fail(problem(400, 'bad-request', 'The request body is not valid JSON.'));
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

interface Paging {
  page: number;
  size: number;
  sort: { property: string; direction: 'asc' | 'desc' } | null;
}

function paging(url: URL, allowedSorts: readonly string[]): Paging {
  const page = Math.max(0, Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0);
  const requested = Number.parseInt(url.searchParams.get('size') ?? '20', 10) || 20;
  const size = Math.min(Math.max(1, requested), limits.pageSizeMax);
  const sortParam = url.searchParams.get('sort');
  if (!sortParam) {
    return { page, size, sort: null };
  }
  const [property = '', direction = 'asc'] = sortParam.split(',');
  if (!allowedSorts.includes(property)) {
    return fail(
      problem(
        400,
        'bad-request',
        `Cannot sort by '${property}'. Allowed: ${[...allowedSorts].sort().join(', ')}`,
      ),
    );
  }
  return { page, size, sort: { property, direction: direction === 'desc' ? 'desc' : 'asc' } };
}

function pageOf<T>(items: T[], { page, size }: Paging) {
  return {
    content: items.slice(page * size, page * size + size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}

type Comparable = string | number | null | undefined;

function compare(a: Comparable, b: Comparable): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b));
}

function sortPosts(posts: DbPost[], sort: Paging['sort'], fallback: NonNullable<Paging['sort']>) {
  const { property, direction } = sort ?? fallback;
  const key = property as 'publishedAt' | 'updatedAt' | 'createdAt' | 'title';
  const sign = direction === 'desc' ? -1 : 1;
  return [...posts].sort((a, b) => sign * compare(a[key], b[key]) || compare(a.id, b.id));
}

export interface HandlerOptions {
  /** Artificial latency, so the demo feels like a network (0 in tests). */
  latencyMs?: number;
}

export function createHandlers(db: MockDb, options: HandlerOptions = {}) {
  const latency = options.latencyMs ?? 0;

  /** Wraps a resolver: latency, thrown problem responses, and persisting writes. */
  function route(
    resolver: (args: {
      request: Request;
      params: Record<string, string>;
    }) => Promise<Response> | Response,
  ) {
    return async ({
      request,
      params,
    }: {
      request: Request;
      params: Record<string, string | readonly string[] | undefined>;
    }) => {
      if (latency > 0) {
        await delay(latency);
      }
      const flat: Record<string, string> = {};
      for (const [name, value] of Object.entries(params)) {
        flat[name] = typeof value === 'string' ? decodeURIComponent(value) : '';
      }
      try {
        const response = await resolver({ request, params: flat });
        if (request.method !== 'GET') {
          db.save();
        }
        return response;
      } catch (error) {
        if (error instanceof Failure) {
          return error.response;
        }
        throw error;
      }
    };
  }

  function currentUser(request: Request): DbUser | null {
    const header = request.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    const token = db.state.accessTokens.find((t) => t.token === header.slice('Bearer '.length));
    if (!token || token.expiresAt <= db.now()) {
      return fail(
        problem(401, 'unauthorized', 'The access token is invalid or has expired.', {
          headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
        }),
      );
    }
    return db.userById(token.userId) ?? fail(problem(401, 'unauthorized', 'Unknown user.'));
  }

  function requireUser(request: Request): DbUser {
    return (
      currentUser(request) ??
      fail(
        problem(401, 'unauthorized', 'Authentication is required.', {
          headers: { 'WWW-Authenticate': 'Bearer' },
        }),
      )
    );
  }

  const canManage = (user: DbUser, post: DbPost) =>
    post.authorId === user.id || user.role === 'ADMIN';

  function managedPost(user: DbUser, slug: string): DbPost {
    const post = db.postBySlug(slug) ?? notFound('Post');
    return canManage(user, post) ? post : forbidden();
  }

  function publishedPost(slug: string): DbPost {
    const post = db.postBySlug(slug);
    return post?.status === 'PUBLISHED' ? post : notFound('Post');
  }

  function issueTokens(user: DbUser, familyId: string = crypto.randomUUID()) {
    const accessToken = `demo-at-${crypto.randomUUID()}`;
    const refreshToken = `demo-rt-${crypto.randomUUID()}`;
    db.state.accessTokens.push({
      token: accessToken,
      userId: user.id,
      expiresAt: db.now() + db.accessTokenTtlSeconds * 1000,
    });
    db.state.refreshTokens.push({
      token: refreshToken,
      userId: user.id,
      familyId,
      revoked: false,
      expiresAt: db.now() + db.refreshTokenTtlSeconds * 1000,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: db.accessTokenTtlSeconds,
      refreshToken,
      refreshExpiresIn: db.refreshTokenTtlSeconds,
    };
  }

  function postInput(body: Record<string, unknown>) {
    const title = str(body.title).trim();
    const contentMarkdown = typeof body.contentMarkdown === 'string' ? body.contentMarkdown : null;
    const errors: FieldViolation[] = [];
    if (!title) {
      errors.push({ field: 'title', message: 'must not be blank' });
    } else if (title.length > limits.titleMax) {
      errors.push({ field: 'title', message: `size must be between 0 and ${limits.titleMax}` });
    }
    if (contentMarkdown === null) {
      errors.push({ field: 'contentMarkdown', message: 'must not be null' });
    } else if (contentMarkdown.length > limits.contentMax) {
      errors.push({
        field: 'contentMarkdown',
        message: `size must be between 0 and ${limits.contentMax}`,
      });
    }
    if (errors.length > 0) {
      invalid(errors);
    }
    const rawTags = Array.isArray(body.tags) ? body.tags.map(str) : [];
    const tags = new Map<string, { name: string; slug: string }>();
    for (const raw of rawTags) {
      const name = raw.trim().replace(/\s+/g, ' ');
      const slug = slugify(name);
      if (!slug || name.length > limits.tagNameMax) {
        fail(
          problem(400, 'bad-request', `Tag '${raw}' must have 1-${limits.tagNameMax} characters.`),
        );
      }
      if (!tags.has(slug)) {
        // An existing tag keeps its original spelling (like the backend's tag table).
        const existing = db.state.posts
          .flatMap((post) => post.tags)
          .find((tag) => tag.slug === slug);
        tags.set(slug, existing ?? { name, slug });
      }
    }
    if (tags.size > limits.tagsPerPostMax) {
      fail(problem(400, 'bad-request', `A post can have at most ${limits.tagsPerPostMax} tags.`));
    }
    return { title, contentMarkdown: contentMarkdown ?? '', tags: [...tags.values()] };
  }

  function commentContent(body: Record<string, unknown>): string {
    const content = str(body.content).trim();
    if (!content) {
      invalid([{ field: 'content', message: 'must not be blank' }]);
    }
    if (content.length > limits.commentMax) {
      invalid([{ field: 'content', message: `size must be between 0 and ${limits.commentMax}` }]);
    }
    return content;
  }

  function commentById(id: string): DbComment {
    return db.state.comments.find((comment) => comment.id === id) ?? notFound('Comment');
  }

  return [
    // ---- auth -------------------------------------------------------------------------------
    http.post(
      `${API}/auth/register`,
      route(async ({ request }) => {
        const body = await readJson(request);
        const username = str(body.username).trim();
        const email = str(body.email).trim();
        const password = str(body.password);
        const displayName = str(body.displayName);
        const errors: FieldViolation[] = [];
        if (!limits.usernamePattern.test(username)) {
          errors.push({ field: 'username', message: '3-30 letters, digits or underscores' });
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > limits.emailMax) {
          errors.push({ field: 'email', message: 'must be a well-formed email address' });
        }
        if (password.length < limits.passwordMin || password.length > limits.passwordMax) {
          errors.push({
            field: 'password',
            message: `size must be between ${limits.passwordMin} and ${limits.passwordMax}`,
          });
        } else if (username && password.toLowerCase().includes(username.toLowerCase())) {
          errors.push({ field: 'password', message: 'must not contain the username' });
        }
        if (displayName.length > limits.displayNameMax) {
          errors.push({ field: 'displayName', message: 'size must be between 0 and 100' });
        }
        if (errors.length > 0) {
          invalid(errors);
        }
        if (db.userByUsername(username) || db.userByLogin(email)) {
          fail(problem(409, 'conflict', 'Username or email is already taken.'));
        }
        const user = db.addUser({ username, email, password, displayName });
        return json(db.publicProfile(user), 201, { Location: `/api/v1/users/${user.username}` });
      }),
    ),
    http.post(
      `${API}/auth/login`,
      route(async ({ request }) => {
        const body = await readJson(request);
        const user = db.userByLogin(str(body.login));
        if (!user || user.password !== str(body.password)) {
          fail(problem(401, 'unauthorized', 'Invalid username/email or password.'));
        }
        return json(issueTokens(user as DbUser));
      }),
    ),
    http.post(
      `${API}/auth/refresh`,
      route(async ({ request }) => {
        const body = await readJson(request);
        const token = db.state.refreshTokens.find((t) => t.token === str(body.refreshToken));
        if (!token || token.expiresAt <= db.now()) {
          return problem(401, 'unauthorized', 'The refresh token is invalid or has expired.');
        }
        if (token.revoked) {
          // Reuse of a rotated token: assume theft and end the whole session family (#21).
          for (const other of db.state.refreshTokens) {
            if (other.familyId === token.familyId) {
              other.revoked = true;
            }
          }
          return problem(401, 'unauthorized', 'The refresh token is invalid or has expired.');
        }
        token.revoked = true;
        const user = db.userById(token.userId) ?? notFound('User');
        return json(issueTokens(user, token.familyId));
      }),
    ),
    http.post(
      `${API}/auth/logout`,
      route(async ({ request }) => {
        const body = await readJson(request);
        const token = db.state.refreshTokens.find((t) => t.token === str(body.refreshToken));
        if (token) {
          for (const other of db.state.refreshTokens) {
            if (other.familyId === token.familyId) {
              other.revoked = true;
            }
          }
        }
        return noContent();
      }),
    ),

    // ---- users ------------------------------------------------------------------------------
    http.get(
      `${API}/users/me/posts`,
      route(({ request }) => {
        const user = requireUser(request);
        const url = new URL(request.url);
        const status = url.searchParams.get('status') as PostStatus | null;
        const page = paging(url, ['updatedAt', 'createdAt', 'publishedAt', 'title']);
        const mine = db.state.posts.filter(
          (post) => post.authorId === user.id && (!status || post.status === status),
        );
        const sorted = sortPosts(mine, page.sort, { property: 'updatedAt', direction: 'desc' });
        return json(
          pageOf(
            sorted.map((post) => db.postSummary(post)),
            page,
          ),
        );
      }),
    ),
    http.get(
      `${API}/users/me/posts/:slug`,
      route(({ request, params }) => {
        const user = requireUser(request);
        const post = db.postBySlug(params.slug ?? '');
        if (post?.authorId !== user.id) {
          notFound('Post');
        }
        return json(db.postDetail(post as DbPost));
      }),
    ),
    http.get(
      `${API}/users/me`,
      route(({ request }) => json(db.privateProfile(requireUser(request)))),
    ),
    http.patch(
      `${API}/users/me`,
      route(async ({ request }) => {
        const user = requireUser(request);
        const body = await readJson(request);
        const errors: FieldViolation[] = [];
        if (body.displayName !== undefined && body.displayName !== null) {
          const name = str(body.displayName).trim();
          if (name.length < 1 || name.length > limits.displayNameMax) {
            errors.push({ field: 'displayName', message: 'size must be between 1 and 100' });
          } else {
            user.displayName = name;
          }
        }
        if (body.bio !== undefined && body.bio !== null) {
          const bio = str(body.bio).trim();
          if (bio.length > limits.bioMax) {
            errors.push({ field: 'bio', message: 'size must be between 0 and 500' });
          } else {
            user.bio = bio || null;
          }
        }
        if (errors.length > 0) {
          invalid(errors);
        }
        return json(db.privateProfile(user));
      }),
    ),
    http.put(
      `${API}/users/me/password`,
      route(async ({ request }) => {
        const user = requireUser(request);
        const body = await readJson(request);
        const newPassword = str(body.newPassword);
        if (newPassword.length < limits.passwordMin || newPassword.length > limits.passwordMax) {
          invalid([{ field: 'newPassword', message: 'size must be between 12 and 128' }]);
        }
        if (str(body.currentPassword) !== user.password) {
          fail(problem(400, 'bad-request', 'Current password is incorrect.'));
        }
        user.password = newPassword;
        // Like blog-backend: every refresh token of the user is revoked (#22).
        for (const token of db.state.refreshTokens) {
          if (token.userId === user.id) {
            token.revoked = true;
          }
        }
        return noContent();
      }),
    ),
    http.get(
      `${API}/users/:username`,
      route(({ params }) => {
        const user = db.userByUsername(params.username ?? '') ?? notFound('User');
        return json(db.publicProfile(user));
      }),
    ),

    // ---- posts ------------------------------------------------------------------------------
    http.get(
      `${API}/posts`,
      route(({ request }) => {
        const url = new URL(request.url);
        const page = paging(url, ['publishedAt', 'title']);
        const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
        const tag = url.searchParams.get('tag')?.trim().toLowerCase() ?? '';
        const author = url.searchParams.get('author')?.trim().toLowerCase() ?? '';
        if (q.length > limits.searchQueryMax) {
          invalid([{ field: 'q', message: 'size must be between 0 and 200' }]);
        }
        const matches = db.state.posts.filter((post) => {
          if (post.status !== 'PUBLISHED') {
            return false;
          }
          if (tag && !post.tags.some((t) => t.slug === tag)) {
            return false;
          }
          if (author && db.userById(post.authorId)?.username.toLowerCase() !== author) {
            return false;
          }
          if (q) {
            const haystack = `${post.title} ${post.contentMarkdown}`.toLowerCase();
            return q.split(/\s+/).every((word) => haystack.includes(word));
          }
          return true;
        });
        const sorted = sortPosts(matches, page.sort, {
          property: 'publishedAt',
          direction: 'desc',
        });
        return json(
          pageOf(
            sorted.map((post) => db.postSummary(post)),
            page,
          ),
        );
      }),
    ),
    http.post(
      `${API}/posts`,
      route(async ({ request }) => {
        const user = requireUser(request);
        const input = postInput(await readJson(request));
        const now = db.isoNow();
        const post: DbPost = {
          id: crypto.randomUUID(),
          slug: db.uniqueSlug(input.title),
          ...input,
          authorId: user.id,
          status: 'DRAFT',
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
          version: 0,
          tldr: { state: 'NONE', summary: null, readyAt: null },
        };
        db.state.posts.push(post);
        return json(db.postDetail(post), 201, { Location: `/api/v1/posts/${post.slug}` });
      }),
    ),
    http.get(
      `${API}/posts/:slug`,
      route(({ params }) => json(db.postDetail(publishedPost(params.slug ?? '')))),
    ),
    http.put(
      `${API}/posts/:slug`,
      route(async ({ request, params }) => {
        const user = requireUser(request);
        const post = managedPost(user, params.slug ?? '');
        const body = await readJson(request);
        const input = postInput(body);
        if (typeof body.version !== 'number') {
          invalid([{ field: 'version', message: 'must not be null' }]);
        }
        if (body.version !== post.version) {
          fail(
            problem(
              409,
              'conflict',
              'The post was changed by someone else. Reload it and try again.',
            ),
          );
        }
        const contentChanged =
          input.title !== post.title || input.contentMarkdown !== post.contentMarkdown;
        Object.assign(post, input, { updatedAt: db.isoNow(), version: post.version + 1 });
        if (contentChanged && post.status === 'PUBLISHED' && post.tldr.state !== 'MANUAL') {
          db.requestTldr(post); // the summary must follow the content (#41)
        }
        return json(db.postDetail(post));
      }),
    ),
    http.delete(
      `${API}/posts/:slug`,
      route(({ request, params }) => {
        const post = managedPost(requireUser(request), params.slug ?? '');
        db.state.posts = db.state.posts.filter((p) => p.id !== post.id);
        db.state.comments = db.state.comments.filter((c) => c.postId !== post.id);
        return noContent();
      }),
    ),
    http.post(
      `${API}/posts/:slug/publish`,
      route(({ request, params }) => {
        const post = managedPost(requireUser(request), params.slug ?? '');
        if (post.contentMarkdown.trim() === '') {
          fail(problem(409, 'conflict', 'A post needs content before it can be published.'));
        }
        if (post.status === 'DRAFT') {
          post.status = 'PUBLISHED';
          post.publishedAt = db.isoNow();
          post.updatedAt = db.isoNow();
          post.version += 1;
          if (post.tldr.state !== 'MANUAL') {
            db.requestTldr(post);
          }
        }
        return json(db.postDetail(post));
      }),
    ),
    http.post(
      `${API}/posts/:slug/unpublish`,
      route(({ request, params }) => {
        const post = managedPost(requireUser(request), params.slug ?? '');
        if (post.status === 'PUBLISHED') {
          post.status = 'DRAFT';
          post.publishedAt = null;
          post.updatedAt = db.isoNow();
          post.version += 1;
        }
        return json(db.postDetail(post));
      }),
    ),

    // ---- TL;DR ------------------------------------------------------------------------------
    http.put(
      `${API}/posts/:slug/tldr`,
      route(async ({ request, params }) => {
        const post = managedPost(requireUser(request), params.slug ?? '');
        const summary = str((await readJson(request)).summary).trim();
        if (!summary || summary.length > limits.tldrSummaryMax) {
          invalid([{ field: 'summary', message: 'size must be between 1 and 600' }]);
        }
        post.tldr = { state: 'MANUAL', summary, readyAt: null };
        return json(db.tldrView(post));
      }),
    ),
    http.post(
      `${API}/posts/:slug/tldr/regenerate`,
      route(({ request, params }) => {
        const post = managedPost(requireUser(request), params.slug ?? '');
        db.requestTldr(post);
        return json({ state: 'PENDING', summary: null });
      }),
    ),

    // ---- comments ---------------------------------------------------------------------------
    http.get(
      `${API}/posts/:slug/comments`,
      route(({ request, params }) => {
        const post = publishedPost(params.slug ?? '');
        const page = paging(new URL(request.url), []);
        const comments = db.state.comments
          .filter((comment) => comment.postId === post.id)
          .sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
        return json(
          pageOf(
            comments.map((comment) => db.commentView(comment)),
            page,
          ),
        );
      }),
    ),
    http.post(
      `${API}/posts/:slug/comments`,
      route(async ({ request, params }) => {
        const user = requireUser(request);
        const post = publishedPost(params.slug ?? '');
        const content = commentContent(await readJson(request));
        const now = db.isoNow();
        const comment: DbComment = {
          id: crypto.randomUUID(),
          postId: post.id,
          authorId: user.id,
          content,
          deleted: false,
          edited: false,
          createdAt: now,
          updatedAt: now,
        };
        db.state.comments.push(comment);
        return json(db.commentView(comment), 201, { Location: `/api/v1/comments/${comment.id}` });
      }),
    ),
    http.get(
      `${API}/comments/:id`,
      route(({ params }) => json(db.commentView(commentById(params.id ?? '')))),
    ),
    http.put(
      `${API}/comments/:id`,
      route(async ({ request, params }) => {
        const user = requireUser(request);
        const comment = commentById(params.id ?? '');
        if (comment.authorId !== user.id) {
          forbidden();
        }
        if (comment.deleted) {
          notFound('Comment');
        }
        comment.content = commentContent(await readJson(request));
        comment.edited = true;
        comment.updatedAt = db.isoNow();
        return json(db.commentView(comment));
      }),
    ),
    http.delete(
      `${API}/comments/:id`,
      route(({ request, params }) => {
        const user = requireUser(request);
        const comment = commentById(params.id ?? '');
        const post = db.state.posts.find((p) => p.id === comment.postId);
        const allowed =
          comment.authorId === user.id || post?.authorId === user.id || user.role === 'ADMIN';
        if (!allowed) {
          forbidden();
        }
        // Soft delete that erases the text (#35): the place stays, the words are gone.
        comment.deleted = true;
        comment.content = null;
        comment.updatedAt = db.isoNow();
        return noContent();
      }),
    ),

    // ---- tags -------------------------------------------------------------------------------
    http.get(
      `${API}/tags`,
      route(() => {
        const counts = new Map<string, { name: string; slug: string; postCount: number }>();
        for (const post of db.state.posts) {
          if (post.status !== 'PUBLISHED') {
            continue;
          }
          for (const tag of post.tags) {
            const entry = counts.get(tag.slug) ?? { ...tag, postCount: 0 };
            entry.postCount += 1;
            counts.set(tag.slug, entry);
          }
        }
        return json([...counts.values()].sort((a, b) => a.name.localeCompare(b.name)));
      }),
    ),
  ];
}

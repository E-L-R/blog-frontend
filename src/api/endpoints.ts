import { z } from 'zod';
import { apiJson, apiVoid } from './client.ts';
import {
  commentViewSchema,
  pageSchema,
  postDetailSchema,
  postSummarySchema,
  privateUserProfileSchema,
  publicUserProfileSchema,
  tagWithCountSchema,
  tldrViewSchema,
  tokenResponseSchema,
  type PostStatus,
} from './schemas.ts';

/** One function per blog-backend operation (`/api/v1`, see contract/openapi.json). */
const V1 = '/api/v1';
const path = (strings: TemplateStringsArray, ...values: string[]) =>
  V1 +
  strings.reduce(
    (result, part, index) =>
      result + part + (index < values.length ? encodeURIComponent(values[index] ?? '') : ''),
    '',
  );

export interface PageParams {
  /** Zero-based, like the API. */
  page?: number;
  size?: number;
  /** `property,direction`, e.g. `publishedAt,desc` (properties are allow-listed by the server). */
  sort?: string;
}

// ---- auth -------------------------------------------------------------------------------

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string | undefined;
}

export const authApi = {
  register: (input: RegisterInput) =>
    apiJson(path`/auth/register`, publicUserProfileSchema, { method: 'POST', body: input }),
  login: (login: string, password: string) =>
    apiJson(path`/auth/login`, tokenResponseSchema, {
      method: 'POST',
      body: { login, password },
    }),
  refresh: (refreshToken: string) =>
    apiJson(path`/auth/refresh`, tokenResponseSchema, {
      method: 'POST',
      body: { refreshToken },
    }),
  logout: (refreshToken: string) =>
    apiVoid(path`/auth/logout`, { method: 'POST', body: { refreshToken } }),
};

// ---- posts ------------------------------------------------------------------------------

export interface PostQuery extends PageParams {
  q?: string | undefined;
  tag?: string | undefined;
  author?: string | undefined;
}

export interface PostInput {
  title: string;
  contentMarkdown: string;
  tags: string[];
}

const postPage = pageSchema(postSummarySchema);

export const postsApi = {
  list: (query: PostQuery, signal?: AbortSignal) =>
    apiJson(path`/posts`, postPage, { query: { ...query }, signal }),
  get: (slug: string, signal?: AbortSignal) =>
    apiJson(path`/posts/${slug}`, postDetailSchema, { signal }),
  create: (input: PostInput) =>
    apiJson(path`/posts`, postDetailSchema, { method: 'POST', body: input, auth: true }),
  /** `version` is the one the editor loaded: a stale version is answered with 409 (lost update). */
  update: (slug: string, input: PostInput & { version: number }) =>
    apiJson(path`/posts/${slug}`, postDetailSchema, { method: 'PUT', body: input, auth: true }),
  remove: (slug: string) => apiVoid(path`/posts/${slug}`, { method: 'DELETE', auth: true }),
  publish: (slug: string) =>
    apiJson(path`/posts/${slug}/publish`, postDetailSchema, { method: 'POST', auth: true }),
  unpublish: (slug: string) =>
    apiJson(path`/posts/${slug}/unpublish`, postDetailSchema, { method: 'POST', auth: true }),
};

export interface MyPostQuery extends PageParams {
  status?: PostStatus | undefined;
}

export const myPostsApi = {
  list: (query: MyPostQuery, signal?: AbortSignal) =>
    apiJson(path`/users/me/posts`, postPage, { query: { ...query }, auth: true, signal }),
  /** The author's view of a post, drafts included. */
  get: (slug: string, signal?: AbortSignal) =>
    apiJson(path`/users/me/posts/${slug}`, postDetailSchema, { auth: true, signal }),
};

// ---- TL;DR ------------------------------------------------------------------------------

export const tldrApi = {
  writeManually: (slug: string, summary: string) =>
    apiJson(path`/posts/${slug}/tldr`, tldrViewSchema, {
      method: 'PUT',
      body: { summary },
      auth: true,
    }),
  regenerate: (slug: string) =>
    apiJson(path`/posts/${slug}/tldr/regenerate`, tldrViewSchema, { method: 'POST', auth: true }),
};

// ---- comments ---------------------------------------------------------------------------

const commentPage = pageSchema(commentViewSchema);

export const commentsApi = {
  list: (slug: string, params: PageParams, signal?: AbortSignal) =>
    apiJson(path`/posts/${slug}/comments`, commentPage, { query: { ...params }, signal }),
  create: (slug: string, content: string) =>
    apiJson(path`/posts/${slug}/comments`, commentViewSchema, {
      method: 'POST',
      body: { content },
      auth: true,
    }),
  update: (id: string, content: string) =>
    apiJson(path`/comments/${id}`, commentViewSchema, {
      method: 'PUT',
      body: { content },
      auth: true,
    }),
  remove: (id: string) => apiVoid(path`/comments/${id}`, { method: 'DELETE', auth: true }),
};

// ---- users and tags ---------------------------------------------------------------------

export interface ProfileInput {
  displayName: string;
  bio: string;
}

export const usersApi = {
  me: (signal?: AbortSignal) =>
    apiJson(path`/users/me`, privateUserProfileSchema, { auth: true, signal }),
  updateMe: (input: ProfileInput) =>
    apiJson(path`/users/me`, privateUserProfileSchema, {
      method: 'PATCH',
      body: input,
      auth: true,
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiVoid(path`/users/me/password`, {
      method: 'PUT',
      body: { currentPassword, newPassword },
      auth: true,
    }),
  profile: (username: string, signal?: AbortSignal) =>
    apiJson(path`/users/${username}`, publicUserProfileSchema, { signal }),
};

export const tagsApi = {
  list: (signal?: AbortSignal) => apiJson(path`/tags`, z.array(tagWithCountSchema), { signal }),
};

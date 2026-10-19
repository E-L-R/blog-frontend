import { z } from 'zod';

/**
 * Runtime schemas for blog-backend's API (contract/openapi.json). Every response is validated, so a
 * contract change surfaces as one clear error instead of `undefined` deep inside a component.
 * Unknown properties are dropped (additive backend changes don't break the app).
 * `contract.test.ts` checks these schemas against the committed OpenAPI document.
 */

const instant = z.iso.datetime({ offset: true });

export const roleSchema = z.enum(['USER', 'ADMIN']);
export const postStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export const tldrStateSchema = z.enum(['NONE', 'PENDING', 'READY', 'FAILED', 'MANUAL']);

export const authorRefSchema = z.object({
  username: z.string(),
  displayName: z.string().nullish(),
});

export const tagRefSchema = z.object({
  name: z.string(),
  slug: z.string(),
});

export const tagWithCountSchema = tagRefSchema.extend({
  postCount: z.number().int(),
});

export const tldrViewSchema = z.object({
  state: tldrStateSchema,
  summary: z.string().nullish(),
});

export const postSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullish(),
  readingTimeMinutes: z.number().int(),
  commentCount: z.number().int(),
  tldr: tldrViewSchema,
  author: authorRefSchema,
  tags: z.array(tagRefSchema),
  status: postStatusSchema,
  publishedAt: instant.nullish(),
});

export const postDetailSchema = postSummarySchema.extend({
  contentMarkdown: z.string(),
  contentHtml: z.string(),
  createdAt: instant,
  updatedAt: instant,
  version: z.number().int(),
});

export const commentViewSchema = z.object({
  id: z.string(),
  author: authorRefSchema.nullish(),
  content: z.string().nullish(),
  edited: z.boolean(),
  deleted: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
});

export const publicUserProfileSchema = z.object({
  username: z.string(),
  displayName: z.string().nullish(),
  bio: z.string().nullish(),
  joinedAt: instant,
  publishedPostCount: z.number().int(),
});

export const privateUserProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  displayName: z.string().nullish(),
  bio: z.string().nullish(),
  role: roleSchema,
  joinedAt: instant,
});

export const tokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string(),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
  refreshExpiresIn: z.number().int().positive(),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    content: z.array(item),
    page: z.number().int().nonnegative(),
    size: z.number().int().positive(),
    totalElements: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });
}

export type Role = z.infer<typeof roleSchema>;
export type PostStatus = z.infer<typeof postStatusSchema>;
export type TldrState = z.infer<typeof tldrStateSchema>;
export type AuthorRef = z.infer<typeof authorRefSchema>;
export type TagRef = z.infer<typeof tagRefSchema>;
export type TagWithCount = z.infer<typeof tagWithCountSchema>;
export type TldrView = z.infer<typeof tldrViewSchema>;
export type PostSummary = z.infer<typeof postSummarySchema>;
export type PostDetail = z.infer<typeof postDetailSchema>;
export type CommentView = z.infer<typeof commentViewSchema>;
export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;
export type PrivateUserProfile = z.infer<typeof privateUserProfileSchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Input limits enforced by the backend (its DTO validation); the forms check them first. */
export const limits = {
  usernamePattern: /^[A-Za-z0-9_]{3,30}$/,
  emailMax: 320,
  passwordMin: 12,
  passwordMax: 128,
  displayNameMax: 100,
  bioMax: 500,
  titleMax: 200,
  contentMax: 100_000,
  tagsPerPostMax: 5,
  tagNameMax: 50,
  commentMax: 2000,
  tldrSummaryMax: 600,
  searchQueryMax: 200,
  pageSizeMax: 50,
} as const;

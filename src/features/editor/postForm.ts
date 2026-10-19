import { z } from 'zod';
import { limits, type PostDetail } from '../../api/schemas.ts';

/** Tags are typed as "Java, Spring Boot"; the API takes a list (and normalizes names itself). */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim().replace(/^#/, '');
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      tags.push(name);
    }
  }
  return tags;
}

export const postFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Give your post a title.')
      .max(limits.titleMax, `At most ${limits.titleMax} characters.`),
    contentMarkdown: z
      .string()
      .max(limits.contentMax, `At most ${limits.contentMax.toLocaleString()} characters.`),
    tags: z.string(),
  })
  .superRefine((values, context) => {
    const tags = parseTags(values.tags);
    if (tags.length > limits.tagsPerPostMax) {
      context.addIssue({
        code: 'custom',
        path: ['tags'],
        message: `At most ${limits.tagsPerPostMax} tags.`,
      });
    }
    const tooLong = tags.find((tag) => tag.length > limits.tagNameMax);
    if (tooLong) {
      context.addIssue({
        code: 'custom',
        path: ['tags'],
        message: `“${tooLong.slice(0, 20)}…” is too long: tags have at most ${limits.tagNameMax} characters.`,
      });
    }
  });

export type PostFormValues = z.infer<typeof postFormSchema>;

export function formValues(post: PostDetail | null): PostFormValues {
  return {
    title: post?.title ?? '',
    contentMarkdown: post?.contentMarkdown ?? '',
    tags: post?.tags.map((tag) => tag.name).join(', ') ?? '',
  };
}

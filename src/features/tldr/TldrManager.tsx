import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { tldrApi } from '../../api/endpoints.ts';
import { userMessage } from '../../api/errors.ts';
import { keys } from '../../api/queryKeys.ts';
import { limits, type PostDetail, type TldrView } from '../../api/schemas.ts';
import { Alert } from '../../components/Alert.tsx';
import { Button } from '../../components/Button.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import styles from '../editor/editor.module.css';

const STATE_TEXT: Record<TldrView['state'], string> = {
  NONE: 'No TL;DR yet. The model writes one when the post is published.',
  PENDING: 'The model is writing a TL;DR…',
  READY: 'Written by the model.',
  FAILED: "The model couldn't write a TL;DR. Try again, or write one yourself.",
  MANUAL: 'Written by you. The model will not overwrite it unless you ask it to.',
};

const manualSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1, 'Write a short summary.')
    .max(limits.tldrSummaryMax, `At most ${limits.tldrSummaryMax} characters.`),
});

/** The author's controls for a post's TL;DR (blog-backend #43): regenerate, or write it yourself. */
export function TldrManager({ post }: { post: PostDetail }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const published = post.status === 'PUBLISHED';

  function applyTldr(tldr: TldrView) {
    for (const key of [keys.myPosts.detail(post.slug), keys.posts.detail(post.slug)]) {
      queryClient.setQueryData<PostDetail>(key, (old) => (old ? { ...old, tldr } : old));
    }
    void queryClient.invalidateQueries({ queryKey: keys.posts.all });
    void queryClient.invalidateQueries({ queryKey: keys.myPosts.all });
  }

  const regenerate = useMutation({
    mutationFn: () => tldrApi.regenerate(post.slug),
    onSuccess: applyTldr,
  });

  const form = useForm({
    resolver: zodResolver(manualSchema),
    defaultValues: { summary: post.tldr.summary ?? '' },
  });
  const writeManually = useMutation({
    mutationFn: (summary: string) => tldrApi.writeManually(post.slug, summary),
    onSuccess: (tldr) => {
      applyTldr(tldr);
      setEditing(false);
    },
  });

  const error = regenerate.error ?? writeManually.error;
  const pending = post.tldr.state === 'PENDING';

  return (
    <section className={styles.panel} aria-labelledby="tldr-manager-heading">
      <h2 id="tldr-manager-heading">TL;DR</h2>
      <p role="status" aria-live="polite">
        {STATE_TEXT[post.tldr.state]}
      </p>
      {post.tldr.summary && !editing && <blockquote>{post.tldr.summary}</blockquote>}
      {error && (
        <Alert tone="error">
          <p>{userMessage(error)}</p>
        </Alert>
      )}
      {editing ? (
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => {
            writeManually.mutate(values.summary);
          })}
        >
          <TextAreaField
            label="Your TL;DR"
            hint={`One or two sentences, at most ${limits.tldrSummaryMax} characters.`}
            rows={4}
            maxLength={limits.tldrSummaryMax}
            error={form.formState.errors.summary?.message}
            {...form.register('summary')}
          />
          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" busy={writeManually.isPending}>
              Save TL;DR
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={() => {
              form.reset({ summary: post.tldr.summary ?? '' });
              setEditing(true);
            }}
          >
            {post.tldr.state === 'MANUAL' ? 'Edit your TL;DR' : 'Write it yourself'}
          </Button>
          {published && (
            <Button
              variant="secondary"
              busy={regenerate.isPending}
              disabled={pending}
              onClick={() => {
                regenerate.mutate();
              }}
            >
              {post.tldr.state === 'READY'
                ? 'Regenerate with the model'
                : 'Generate with the model'}
            </Button>
          )}
        </div>
      )}
      {!published && <p className={styles.hint}>Model TL;DRs are written for published posts.</p>}
    </section>
  );
}

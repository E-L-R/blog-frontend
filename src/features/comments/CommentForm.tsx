import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { limits } from '../../api/schemas.ts';
import { Button } from '../../components/Button.tsx';
import { TextAreaField } from '../../components/Field.tsx';
import styles from './comments.module.css';

const schema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(limits.commentMax, `At most ${limits.commentMax} characters.`),
});

/** New comments and edits. Plain text: blog-backend stores comments as text, never as markup. */
export function CommentForm({
  label,
  submitLabel,
  defaultValue = '',
  busy,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  defaultValue?: string;
  busy: boolean;
  onSubmit: (content: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { content: defaultValue } });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ content }) => {
        try {
          await onSubmit(content);
          form.reset({ content: '' });
        } catch {
          // The caller shows the error; keep the text so nothing is lost.
        }
      })}
    >
      <TextAreaField
        label={label}
        rows={4}
        maxLength={limits.commentMax}
        error={form.formState.errors.content?.message}
        {...form.register('content')}
      />
      <div className={styles.actions}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" busy={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

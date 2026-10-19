import { type InputHTMLAttributes, type Ref, type TextareaHTMLAttributes, useId } from 'react';
import styles from './ui.module.css';

interface FieldChrome {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** Wires label, hint and error to the control (aria-describedby, aria-invalid) for screen readers. */
function useFieldIds(hint: string | undefined, error: string | undefined) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return { id, hintId, errorId, describedBy };
}

function Messages({
  hint,
  hintId,
  error,
  errorId,
}: {
  hint: string | undefined;
  hintId: string | undefined;
  error: string | undefined;
  errorId: string | undefined;
}) {
  return (
    <>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className={styles.error}>
          {error}
        </span>
      )}
    </>
  );
}

type TextFieldProps = FieldChrome &
  InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function TextField({ label, error, hint, className, ...input }: TextFieldProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error);
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      <Messages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

type TextAreaFieldProps = FieldChrome &
  TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function TextAreaField({ label, error, hint, className, ...textarea }: TextAreaFieldProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(hint, error);
  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <textarea
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...textarea}
      />
      <Messages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

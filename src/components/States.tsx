import type { ReactNode } from 'react';
import { ApiError, userMessage } from '../api/errors.ts';
import { Alert } from './Alert.tsx';
import { Button } from './Button.tsx';
import styles from './ui.module.css';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" /> {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className={styles.state}>{children}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const canRetry =
    onRetry !== undefined &&
    (!(error instanceof ApiError) || error.reason !== 'http' || error.status >= 500);
  return (
    <Alert
      tone="error"
      action={
        canRetry ? (
          <Button variant="secondary" size="small" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      <p>{userMessage(error)}</p>
    </Alert>
  );
}

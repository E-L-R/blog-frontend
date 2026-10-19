import type { ReactNode } from 'react';
import styles from './ui.module.css';

type Tone = 'info' | 'success' | 'warning' | 'error';

const toneClass: Record<Tone, string | undefined> = {
  info: styles.info,
  success: styles.success,
  warning: styles.warning,
  error: styles.errorTone,
};

/** Errors interrupt screen readers (role="alert"); everything else is announced politely. */
export function Alert({
  tone = 'info',
  children,
  action,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={[styles.alert, toneClass[tone]].join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div>{children}</div>
      {action}
    </div>
  );
}

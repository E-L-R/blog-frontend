import styles from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'normal' | 'small';

/** Button styling, also for links that should look like buttons (`<Link className={…}>`). */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'normal') {
  return [styles.button, styles[variant], size === 'small' ? styles.small : '']
    .filter(Boolean)
    .join(' ');
}

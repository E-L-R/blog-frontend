import { Link } from 'react-router';
import type { TagRef } from '../api/schemas.ts';
import styles from './ui.module.css';

export function TagList({ tags, label = 'Tags' }: { tags: TagRef[]; label?: string }) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <ul className={styles.tags} aria-label={label}>
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link to={`/?tag=${encodeURIComponent(tag.slug)}`} className={styles.tag}>
            #{tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

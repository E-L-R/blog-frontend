import { Link, useLocation } from 'react-router';
import { buttonClass } from './buttonClass.ts';
import styles from './ui.module.css';

/**
 * Previous/next links that keep every other search parameter (search, tag, status).
 * `page` in the URL is 1-based for people; the API is 0-based.
 */
export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const location = useLocation();
  if (totalPages <= 1) {
    return null;
  }
  const hrefFor = (target: number) => {
    const params = new URLSearchParams(location.search);
    if (target <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(target));
    }
    const search = params.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      {page > 1 ? (
        <Link to={hrefFor(page - 1)} className={buttonClass('secondary')} rel="prev">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link to={hrefFor(page + 1)} className={buttonClass('secondary')} rel="next">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

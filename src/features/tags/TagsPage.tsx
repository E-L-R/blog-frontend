import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { tagsApi } from '../../api/endpoints.ts';
import { keys } from '../../api/queryKeys.ts';
import { EmptyState, ErrorState, LoadingState } from '../../components/States.tsx';
import ui from '../../components/ui.module.css';
import { plural } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';

export function TagsPage() {
  useDocumentTitle('Tags');
  const tags = useQuery({ queryKey: keys.tags, queryFn: ({ signal }) => tagsApi.list(signal) });

  return (
    <section>
      <h1>Tags</h1>
      {tags.isPending ? (
        <LoadingState label="Loading tags…" />
      ) : tags.isError ? (
        <ErrorState error={tags.error} onRetry={() => void tags.refetch()} />
      ) : tags.data.length === 0 ? (
        <EmptyState>No tags yet.</EmptyState>
      ) : (
        <ul className={ui.tags}>
          {[...tags.data]
            .sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name))
            .map((tag) => (
              <li key={tag.slug}>
                <Link to={`/?tag=${encodeURIComponent(tag.slug)}`} className={ui.tag}>
                  #{tag.name} <span aria-hidden="true">({tag.postCount})</span>
                  <span className="visually-hidden">, {plural(tag.postCount, 'post')}</span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { ApiError } from '../api/errors.ts';
import { ErrorState } from '../components/States.tsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.ts';

export function NotFoundPage({ message }: { message?: string }) {
  useDocumentTitle('Not found');
  return (
    <section>
      <h1>Page not found</h1>
      <p>{message ?? "We couldn't find what you were looking for."}</p>
      <p>
        <Link to="/">Back to the latest posts</Link>
      </p>
    </section>
  );
}

/** Rendered inside the layout when a page throws while rendering. */
export function RouteErrorPage() {
  const error = useRouteError();
  useDocumentTitle('Error');
  if (
    (isRouteErrorResponse(error) && error.status === 404) ||
    (error instanceof ApiError && error.isNotFound)
  ) {
    return <NotFoundPage />;
  }
  console.error(error);
  return (
    <section>
      <h1>Something went wrong</h1>
      <ErrorState
        error={error}
        onRetry={() => {
          window.location.reload();
        }}
      />
    </section>
  );
}

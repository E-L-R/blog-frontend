import { Navigate, Outlet, useLocation } from 'react-router';
import { LoadingState } from '../components/States.tsx';
import { useAuth } from './authContext.ts';

/** Pages for signed-in users only. Others go to /login and come back afterwards. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return <LoadingState label="Checking your session…" />;
  }
  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}

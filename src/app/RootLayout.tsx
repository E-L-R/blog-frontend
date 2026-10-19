import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/authContext.ts';
import { Alert } from '../components/Alert.tsx';
import { Button } from '../components/Button.tsx';
import { buttonClass } from '../components/buttonClass.ts';
import { config } from '../config/env.ts';
import { displayName } from '../lib/format.ts';
import { DemoBanner } from './DemoBanner.tsx';
import styles from './layout.module.css';

const navClass = styles.navLink;

export function RootLayout() {
  const { status, user, signOut, sessionExpired, dismissSessionExpired } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    await navigate('/');
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {config.demoMode && <DemoBanner />}
      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <Link to="/" className={styles.brand}>
            {config.siteName}
          </Link>
          <nav className={styles.nav} aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Posts
            </NavLink>
            <NavLink to="/tags" className={navClass}>
              Tags
            </NavLink>
            {status === 'authenticated' && user ? (
              <>
                <NavLink to="/write" end className={navClass}>
                  Write
                </NavLink>
                <NavLink to="/dashboard" className={navClass}>
                  My posts
                </NavLink>
                <NavLink to="/settings" className={navClass}>
                  {displayName(user)}
                </NavLink>
                <Button variant="secondary" size="small" onClick={() => void handleSignOut()}>
                  Sign out
                </Button>
              </>
            ) : status === 'anonymous' ? (
              <>
                <NavLink to="/login" className={navClass}>
                  Sign in
                </NavLink>
                <Link to="/register" className={buttonClass('primary', 'small')}>
                  Create account
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`container ${styles.main}`}>
        {sessionExpired && status === 'anonymous' && (
          <Alert
            tone="warning"
            action={
              <Button variant="ghost" size="small" onClick={dismissSessionExpired}>
                Dismiss
              </Button>
            }
          >
            <p>
              Your session has ended. <Link to="/login">Sign in again</Link> to continue.
            </p>
          </Alert>
        )}
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className="container">
          <p>
            TL;DRs marked “AI” are written by{' '}
            <a href={config.modelRepoUrl}>a language model built from scratch for this blog</a>.
            They can be wrong: the post itself is the source of truth.
          </p>
          <p>
            Source: <a href={config.frontendRepoUrl}>frontend</a> ·{' '}
            <a href={config.backendRepoUrl}>backend</a> · <a href={config.modelRepoUrl}>model</a>
          </p>
        </div>
      </footer>
      <ScrollRestoration />
      <FocusOnNavigation />
    </>
  );
}

/**
 * After client-side navigation, move focus to <main> so keyboard and screen-reader users start at the
 * new content (a full page load would do this; an SPA has to do it itself). Not on the first render.
 */
function FocusOnNavigation() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

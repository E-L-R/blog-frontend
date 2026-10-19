import { useState } from 'react';
import { Button } from '../components/Button.tsx';
import { DEMO_LOGIN } from '../config/demo.ts';
import { demoStatus } from './demoStatus.ts';
import styles from './layout.module.css';

/** Visible on every page in demo mode: nobody should mistake sample data for the real blog. */
export function DemoBanner() {
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    const { resetDemoData } = await import('../mocks/browser.ts');
    resetDemoData();
    window.location.assign('/');
  }

  return (
    <aside className={styles.banner} aria-label="Demo mode">
      <div className={`container ${styles.bannerInner}`}>
        {demoStatus.unavailable ? (
          <p>
            <strong>Demo unavailable:</strong> this browser blocks the service worker that runs the
            demo API (private windows often do). Try a normal window.
          </p>
        ) : (
          <>
            <p>
              <strong>Demo mode:</strong> sample data, stored only in this browser. Sign in as{' '}
              <code>{DEMO_LOGIN.username}</code> / <code>{DEMO_LOGIN.password}</code>.
            </p>
            <Button variant="ghost" size="small" onClick={() => void reset()} busy={resetting}>
              Reset demo data
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}

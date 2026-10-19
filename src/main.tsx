import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { demoStatus } from './app/demoStatus.ts';
import { config } from './config/env.ts';
import './styles/global.css';

/** Demo mode: start the mock API (a service worker) before the app makes its first request. */
async function startDemoApi(): Promise<void> {
  if (!config.demoMode) {
    return;
  }
  try {
    const { startDemoWorker } = await import('./mocks/browser.ts');
    await startDemoWorker();
  } catch (error) {
    demoStatus.unavailable = true;
    console.error('The demo API could not start', error);
  }
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html has no #root element');
}

void startDemoApi().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

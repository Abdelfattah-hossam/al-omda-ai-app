import './polyfills';
import './lib/turnstile';

import { createRoot } from 'react-dom/client';

import App from './App';
import PasswordRecovery from './PasswordRecovery';
import { ErrorBoundary } from '@/components/error-boundary';

import './glass-theme.css';
import './index.css';
import './voice-experience.css';
import './chat-palette.css';
import './chat-design.css';
import './workspace-palette.css';
import './mobile-workspace.css';
import './chat-composer-alignment.css';
import './profile-account.css';
import './guest-nudge.css';
import './welcome-greeting.css';
import './chat-legacy.css';

// Cache the production app shell so Munjizly can open while the device is offline.
// API-backed actions still require a connection and are never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // A phone often keeps the app open for days; without this it keeps running
    // the old bundle forever and fixes never reach it. When a new worker takes
    // control, reload once onto the fresh assets. The first-ever registration
    // must not reload: there was no previous controller.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        void registration.update();
        // Re-check when the user returns to an already-open app.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update();
        });
      })
      .catch((error) => {
        console.warn('Munjizly offline shell could not be registered.', error);
      });
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    {location.pathname==='/forgot-password'||location.pathname==='/reset-password'?<PasswordRecovery reset={location.pathname==='/reset-password'}/>:<App />}
  </ErrorBoundary>,
);

import './legacy-performance.css';

import './agent-controls.css';
import './pages-organized.css';

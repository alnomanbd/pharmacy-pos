import api from '@dawai/shared/api/client';
import { useLangStore } from '@dawai/shared/i18n/lang';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ToastProvider from '@dawai/shared/components/Toast';
import { restoreSession } from '@dawai/shared/api/client';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import ErrorBoundary from '@dawai/shared/components/ErrorBoundary';
import App from './App';
import { registerServiceWorker } from './pwa';
import { installErrorReporting } from '@dawai/shared/lib/errorReporting';
import { installPhoneticTyping } from '@dawai/shared/lib/phoneticTyping';
// Loaded first: it scopes the till's browser storage to whoever signs in.
import './branch';
import './styles/index.css';
// After the app's own sheet: where both define a selector, the system wins.
import '@dawai/shared/styles/theme.css';
// The sign-in screen is its own composition, loaded last so it wins outright.
import './styles/auth.css';

/*
 * Trade the refresh cookie for an access token before anything renders a
 * routing decision. It resolves either way — not being signed in is the
 * ordinary case, not an error — and flips `hydrated` when it is done.
 */
if (window.location.pathname.startsWith('/support/claim')) {
  /*
   * Not on the support-view handover. The claim brings its own session, and
   * the cookie on this host may be somebody else's — on localhost, the
   * operator's console — so a refresh racing the claim could win it.
   */
  useAuthStore.getState().markHydrated();
} else {
  void restoreSession();
}

/* Installable on a phone, and alerts on it — see pwa.ts. */
registerServiceWorker();
/* Crashes in this browser go to the server — see shared/lib/errorReporting. */
installErrorReporting('shop');

/* Bangla from the ordinary keyboard in every text box, when the A | অ switch says so. */
installPhoneticTyping();

/*
 * The screen's language, on every request, so the API answers a refusal in
 * Bangla when the screen is in Bangla — and remembers it for the emails and
 * push notifications it sends this person later. The console never sends it.
 */
api.interceptors.request.use((config) => {
  config.headers['X-UI-Lang'] = useLangStore.getState().lang;
  return config;
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

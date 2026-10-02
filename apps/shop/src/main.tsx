import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ToastProvider from '@dawai/shared/components/Toast';
import { restoreSession } from '@dawai/shared/api/client';
import { useAuthStore } from '@dawai/shared/store/auth.store';
import ErrorBoundary from '@dawai/shared/components/ErrorBoundary';
import App from './App';
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

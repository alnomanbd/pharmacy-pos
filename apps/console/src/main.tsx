import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ToastProvider from '@dawai/shared/components/Toast';
import { restoreSession } from '@dawai/shared/api/client';
import ErrorBoundary from '@dawai/shared/components/ErrorBoundary';
import App from './App';
import { installErrorReporting } from '@dawai/shared/lib/errorReporting';
import { installPhoneticTyping } from '@dawai/shared/lib/phoneticTyping';
import './styles/index.css';
// After the app's own sheet: where both define a selector, the system wins.
import '@dawai/shared/styles/theme.css';

/*
 * Trade the refresh cookie for an access token before anything renders a
 * routing decision. It resolves either way — not being signed in is the
 * ordinary case, not an error — and flips `hydrated` when it is done.
 */
void restoreSession();

/* Crashes in this browser go to the server — see shared/lib/errorReporting. */
installErrorReporting('console');

/* Bangla from the ordinary keyboard in every text box, when the A | অ switch says so. */
installPhoneticTyping();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

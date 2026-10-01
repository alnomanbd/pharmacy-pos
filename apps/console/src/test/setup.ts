import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without this, a component from one test is still mounted during the next and
// `getByText` starts finding two of everything.
afterEach(() => cleanup());

/*
 * `window.matchMedia`, which jsdom does not implement.
 *
 * Anything that reads the system theme calls it — `useTheme` does, so every
 * component test that renders a shell would otherwise die on
 * "matchMedia is not a function" rather than on anything to do with the
 * component. Stubbed here rather than per test because the answer is the same
 * everywhere: no preference, no listeners.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/*
 * `ResizeObserver`, likewise absent.
 *
 * The support banner publishes its measured height through one, and the Bangla
 * keyboard measures itself to stay on screen.
 */
if (!('ResizeObserver' in window)) {
  class Stub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = Stub;
}

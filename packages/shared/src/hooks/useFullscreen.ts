import { useEffect, useState } from 'react';

/**
 * Fullscreen, and whether we are in it.
 *
 * Shared by the shop app and the operator console. It was written inline in
 * the shop's own layout, and the platform console — which is the screen most
 * likely to be left open on a wall or a second monitor all day — had no way
 * into fullscreen at all.
 *
 * The state comes from the `fullscreenchange` event rather than from the click,
 * because Escape and F11 leave fullscreen without going through the button; a
 * flag set on click alone ends up claiming the app is still fullscreen when it
 * plainly is not.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // Ignored rather than thrown: a browser can refuse this (an iframe
      // without the permission, a policy), and a refused view mode is not
      // worth an error dialog over.
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  return { isFullscreen, toggle };
}

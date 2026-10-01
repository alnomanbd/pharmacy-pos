/*
 * The theme before the first paint, on every screen.
 *
 * A file of its own rather than inline in the document, so a deployment with a
 * strict `script-src` still allows it — this is the same reason
 * `pharmacy/public/theme-boot.js` is a file.
 */
(function () {
  try {
    var stored = localStorage.getItem('dawai-site-theme');
    var dark =
      stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* Storage refused. The provider below sets it a moment later. */
  }
})();

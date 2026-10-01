/* Sets the dark class before React paints — see index.html. */
(function () {
  try {
    var t = localStorage.getItem('dawai-theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {
    /* Storage refused: the app's own theme hook sets it a moment later. */
  }
})();

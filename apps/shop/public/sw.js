/*
 * The Dawai shop app's service worker.
 *
 * Three jobs, and deliberately no more:
 *
 * 1. Make the app installable, and open from the home screen without a
 *    network round trip for the shell: the page itself is fetched fresh
 *    whenever the line is up, and the last copy is used when it is not.
 * 2. Keep the hashed build files (/assets/*), which never change under the
 *    same name, so a reopened app does not download them again.
 * 3. Show the owner's alerts — takings, stock, new orders — and open the
 *    right screen when one is tapped.
 *
 * The API is never touched: a shop's figures always come from the server,
 * and the counter's own offline queue handles a line that is down.
 */
const SHELL = 'dawai-shell-v1';
const ASSETS = 'dawai-assets-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/icon-192.png', '/manifest.webmanifest']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  /* The page: fresh when possible, the last copy when the line is down. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || Response.error())),
    );
    return;
  }

  /* Build files: named by their contents, so a copy is good forever. */
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) void c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let msg = { title: 'Dawai', body: '', url: '/dashboard', tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    if (event.data) msg.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: msg.tag,
      renotify: !!msg.tag,
      data: { url: msg.url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
});

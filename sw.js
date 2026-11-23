// オフライン対応用の Service Worker
// 方針: ネットにつながる時は最新版を取得してキャッシュを更新、つながらない時はキャッシュを使う
const CACHE = 'matome-v5';
const SHELL = ['./', './index.html', './css/style.css', './js/app.js', './manifest.webmanifest', './icons/icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Firebase の部品（版番号つきで中身が変わらない）は、一度取ったらキャッシュから出す
  if (req.url.startsWith('https://www.gstatic.com/firebasejs/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});

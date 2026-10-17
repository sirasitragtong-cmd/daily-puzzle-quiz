const CACHE_NAME = 'daily-puzzle-quiz-cache-v3';
const PRECACHE_URLS = [
    './',
    './index.html',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
    'https://unpkg.com/lucide@latest',
    'https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://unpkg.com/html5-qrcode',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const url of PRECACHE_URLS) {
                try {
                    const req = new Request(url, {
                        mode: url.startsWith('http') ? 'cors' : 'same-origin',
                        cache: 'reload'
                    });
                    const res = await fetch(req);
                    if (res && (res.ok || res.type === 'opaque')) {
                        await cache.put(url, res);
                    }
                } catch (e) {
                    // Ignore individual precache failures
                }
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Never intercept Firebase Auth / Firestore API calls
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('apis.google.com')
    ) {
        return;
    }

    // Navigation / HTML requests: Always fetch freshest from network (no-store) when online, fallback to cache when offline
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
        event.respondWith(
            fetch(req, { cache: 'no-store' })
                .then((networkRes) => {
                    if (networkRes && networkRes.ok) {
                        const copy = networkRes.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(req, copy);
                            cache.put('./index.html', copy.clone());
                        });
                    }
                    return networkRes;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    return (
                        (await cache.match(req)) ||
                        (await cache.match('./index.html')) ||
                        (await cache.match('./'))
                    );
                })
        );
        return;
    }

    // Static assets & CDN libraries: Stale-while-revalidate (instant from cache, update in background)
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(req);
            const networkFetch = fetch(req)
                .then((networkRes) => {
                    if (networkRes && (networkRes.ok || networkRes.type === 'opaque')) {
                        cache.put(req, networkRes.clone());
                    }
                    return networkRes;
                })
                .catch(() => cached);

            return cached || networkFetch;
        })
    );
});

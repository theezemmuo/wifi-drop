const CACHE_NAME = 'wifidrop-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/socket.io/socket.io.js',
    '/icon-192.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    // Network-first strategy (fallback to cache if offline)
    e.respondWith(
        fetch(e.request)
            .catch(() => caches.match(e.request))
    );
});

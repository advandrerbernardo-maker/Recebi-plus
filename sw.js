/* Recebi+ service worker: no caching of private account or customer data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network requests pass through unchanged */ });

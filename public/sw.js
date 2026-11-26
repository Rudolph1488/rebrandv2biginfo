// Minimal network-first Service Worker for PWA installability without stale CRM data
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Network pass-through ensures orders, stock, and cashflow are always live
});

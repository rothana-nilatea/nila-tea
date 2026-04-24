// Nila Tea POS - Service Worker with Push Notifications
const CACHE = 'nila-tea-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── PUSH NOTIFICATION HANDLER ──
self.addEventListener('push', e => {
  if (!e.data) return;
  
  const data = e.data.json();
  const options = {
    body: data.body || '',
    icon: data.icon || '/logo.svg',
    badge: '/logo.svg',
    tag: data.tag || 'nila-notification',
    data: { url: data.url || '/' },
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
    silent: false,
    vibrate: [200, 100, 200],
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'Nila Tea', options)
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  
  const url = e.notification.data?.url || '/';
  
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('nila-tea') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── FETCH (offline cache) ──
self.addEventListener('fetch', e => {
  // Pass through all requests - no offline caching needed for POS
});

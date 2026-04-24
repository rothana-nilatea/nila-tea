// Nila Tea POS - Service Worker v3
self.addEventListener('install', e => { console.log('[SW] Install'); self.skipWaiting(); });
self.addEventListener('activate', e => { console.log('[SW] Activate'); e.waitUntil(clients.claim()); });

self.addEventListener('push', e => {
  console.log('[SW] Push received');
  if(!e.data) return;
  let d;
  try { d=e.data.json(); } catch(err) { d={title:'Nila Tea',body:e.data.text()}; }
  e.waitUntil(
    self.registration.showNotification(d.title||'Nila Tea POS', {
      body: d.body||'',
      icon: '/Logo_Nila_Tea.png',
      badge: '/Logo_Nila_Tea.png',
      tag: d.tag||'nila',
      requireInteraction: true,
      vibrate: [300,100,300],
      data: { url: 'https://nila-tea-app.onrender.com' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list => {
      for(const c of list){ if(c.url.includes('nila-tea') && 'focus' in c) return c.focus(); }
      return clients.openWindow('https://nila-tea-app.onrender.com');
    })
  );
});

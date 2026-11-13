/* ============================================================
   جمعية الحاسوب – IUA | إلغاء عامل الخدمة وتفريغ الذاكرة المؤقتة
   ضمان تحميل أحدث نسخة من الموقع المباشر المتجاوب
   ============================================================ */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        clients.forEach(client => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url);
          }
        });
      })
  );
});

self.addEventListener('fetch', () => {
  // لا يتم اعتراض أي طلبات بعد الآن
});

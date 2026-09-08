self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || '' };
  }

  const title = payload.title || 'This is Grade';
  const options = {
    body: payload.body || '该查看今天的核心素养进度了。',
    icon: '/assets/grade-icon.svg',
    badge: '/assets/grade-icon.svg',
    tag: payload.tag || 'effort-progress',
    renotify: false,
    data: { url: payload.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      return existing.navigate(targetUrl);
    }
    return self.clients.openWindow(targetUrl);
  })());
});

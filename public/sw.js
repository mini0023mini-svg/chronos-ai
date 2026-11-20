/* CHRONOS AI Service Worker — Phase 8
 * 离线优先的缓存策略 + 通知点击处理。
 * 安全约束：不缓存任何 API / Supabase 请求（避免 RLS 数据落入 SW 缓存）。
 */
const CACHE_VERSION = 'chronos-ai-v8';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

// 预缓存的应用外壳：离线时保证页面骨架可加载
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('chronos-ai-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 判断请求是否应绕过缓存（API / Supabase / 非 GET） */
function isNetworkOnly(url, request) {
  if (request.method !== 'GET') return true;
  return (
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/realtime/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/storage/') ||
    url.hostname.endsWith('.supabase.co') ||
    url.pathname.startsWith('/api/')
  );
}

/** 导航请求：网络优先，离线回退到缓存的 index.html */
async function navigationStrategy(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
  }
}

/** 静态资源：缓存优先，后台更新（stale-while-revalidate） */
async function assetStrategy(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 跨域交给浏览器（Supabase 等）
  if (isNetworkOnly(url, request)) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(js|css|png|svg|woff2?|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(assetStrategy(request));
  }
});

/** 通知点击：聚焦已打开页面，否则打开通知页 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/** 标准 Web Push：展示通知（未来接入推送服务时可直接使用） */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'CHRONOS AI';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/favicon.svg',
      tag: data.tag || 'chronos',
      data: data.data || { url: '/notifications' },
    }),
  );
});

/** 页面发来的消息：立即激活新版本 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

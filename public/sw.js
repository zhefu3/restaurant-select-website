/**
 * Athroics 餐厅 · Service Worker（离线壳 + 缓存）。
 *
 * 策略（保守、坏不了）：
 *  - 写请求（非 GET）：不碰，直接放行。
 *  - /_next/static（带 hash，永不变）：cache-first。
 *  - 同源导航 / API：network-first，离线时回退缓存（在线永远拿新数据）。
 *  - 跨域（OSM 地图瓦片等）：cache-first，机会性缓存，离线也能看已浏览过的区域。
 */
const VERSION = "athroics-v1";
const SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // 写请求不缓存
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.startsWith("/_next/static")) {
    e.respondWith(cacheFirst(req));
  } else if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(cacheFirst(req));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) {
      (await caches.open(VERSION)).put(req, res.clone());
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match("/")) || Response.error();
  }
}

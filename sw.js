/*
 * 離線支援（Service Worker）。只在以 http(s) 開啟時生效（例如 GitHub Pages）；直接用檔案開啟 index.html 本來就能離線。
 * - 網頁本身：先連網路取最新版，連不上才用上次存下來的版本（所以更新資料後不會卡在舊版）。
 * - Leaflet 地圖程式：存過就直接用快取。
 * - 地圖圖磚、iNaturalist 查詢：不處理，離線時由網頁自己顯示「需要網路」。
 * 這個檔案沒有任何行程資料，換行程不用改。
 */
const CACHE = "trip-shell-v1";
const CDN = ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(["./", "./index.html"]);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {})));   // CDN 存不到不影響安裝
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html"))) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  if (url.hostname === "unpkg.com" && url.pathname.includes("/leaflet@")) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
  }
});

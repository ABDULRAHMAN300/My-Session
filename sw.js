/* ============================================================
   Service Worker — جدول الحصص الخارجية
   النسخة 2: تعرض المخزَّن فورًا وتحدّث في الخلفية، وتخزّن الخطوط.

   عند رفع تحديث مستقبلًا: غيّر الرقم في السطر التالي فقط
   (hisas-v7 ← hisas-v8) ليأخذ الجوال النسخة الجديدة.
   ملاحظة: التحديث يُثبَّت في الفتح الأول ويظهر في الفتح الثاني.
   ============================================================ */
const CACHE = "hisas-v7";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-maskable.png"
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* يعرض المخزَّن فورًا، ويجلب التحديث في الخلفية للفتح القادم */
function staleWhileRevalidate(req, fallback) {
  return caches.match(req).then(hit => {
    const net = fetch(req)
      .then(res => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => hit || (fallback ? caches.match(fallback) : undefined));

    if (hit) { net.catch(() => {}); return hit; }
    return net;
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* الخطوط: من المخزَّن أولًا، فلا انتظار للشبكة ولا تعطّل بلا إنترنت */
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const p = url.pathname;
  const isPage = req.mode === "navigate" || p.endsWith("/") || p.endsWith("/index.html");
  e.respondWith(staleWhileRevalidate(req, isPage ? "./index.html" : null));
});

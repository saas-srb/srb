/* Service worker of the installed app (app hosts only; the website never registers it).
 *
 *  - Offline: a navigation that fails shows /offline.html. Nothing about a signed-in session is ever cached: pages and API
 *    responses always come from the network, so a shared device never shows the previous person's data.
 *  - Speed: immutable build files (/_next/static/) and the app icons are cached.
 *  - Push: shows notifications, opens the right page on tap, and re-subscribes if the browser rotates the subscription.
 */
const VERSION = "v3";
// Local development serves build files under stable names (not content-hashed): caching them "first" would pin the browser to old code. Never intercept them there.
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(self.location.hostname);
const STATIC_CACHE = `app-static-${VERSION}`;
const SHELL_CACHE = `app-shell-${VERSION}`;
// The offline page is rendered by the site itself (so it carries the company's logo, name and colours); the plain static page is the
// last resort. Both are kept in the shell cache, and the dynamic one is refreshed whenever it is older than a day.
const OFFLINE_URL = "/offline-shell";
const OFFLINE_FALLBACK_URL = "/offline.html";
const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Keeps the themed offline page, and what it needs to draw without a network (its stylesheets and logo), up to date. */
async function cacheOfflinePage() {
  const shell = await caches.open(SHELL_CACHE);
  const res = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error("offline page unavailable");
  // Keep the page as plain HTML + CSS: with no network its script bundles cannot load, and a page that tries to hydrate would end in
  // the framework's "couldn't load" error. Only the page's own tiny retry script is kept (not the framework's data scripts, which also quote it).
  const html = (await res.text()).replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (m, body) => (body.includes("offline-retry") && !body.includes("__next_f") ? m : ""));
  await shell.put(OFFLINE_URL, new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "x-cached-at": String(Date.now()) } }));
  const statics = await caches.open(STATIC_CACHE);
  const css = [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css[^"]*)"/g)].map((m) => m[1]);
  await Promise.all(css.map((u) => statics.add(u).catch(() => {})));
  const logos = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => !u.startsWith("data:")).slice(0, 3);
  await Promise.all(
    logos.map(async (u) => {
      // fetch + put (not add): a logo on another host comes back opaque, which `add` refuses but `put` keeps.
      const r = new Request(u, { mode: u.startsWith("/") ? "same-origin" : "no-cors" });
      const got = await fetch(r).catch(() => null);
      if (got && (got.ok || got.type === "opaque")) await statics.put(r, got);
    }),
  );
}

async function offlineResponse() {
  const shell = await caches.open(SHELL_CACHE);
  return (await shell.match(OFFLINE_URL)) || (await shell.match(OFFLINE_FALLBACK_URL)) || Response.error();
}

async function offlineIsStale() {
  const hit = await (await caches.open(SHELL_CACHE)).match(OFFLINE_URL);
  const at = Number(hit?.headers.get("x-cached-at") ?? 0);
  return !at || Date.now() - at > OFFLINE_MAX_AGE_MS;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.add(new Request(OFFLINE_FALLBACK_URL, { cache: "reload" })).catch(() => {});
      await cacheOfflinePage().catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== STATIC_CACHE && key !== SHELL_CACHE) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Images (the company's logo, wherever it is stored): network first; offline, the copy kept for the offline page.
  if (req.destination === "image" && !url.pathname.startsWith("/_next/")) {
    event.respondWith(fetch(req).catch(async () => (await (await caches.open(STATIC_CACHE)).match(req)) || Response.error()));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Pages: network only; the offline page when the network is down.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = (await event.preloadResponse) || (await fetch(req));
          // Online and fine: keep the offline page fresh in the background (at most once a day).
          if (res.ok) event.waitUntil(offlineIsStale().then((stale) => stale && cacheOfflinePage()).catch(() => {}));
          return res;
        } catch {
          return offlineResponse();
        }
      })(),
    );
    return;
  }

  // Immutable build output: cache first (production only — see DEV_HOST).
  if (!DEV_HOST && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // App icons: stale while revalidate.
  if (url.pathname.startsWith("/pwa/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    );
  }
  // Everything else (API calls, RSC payloads, uploads) goes straight to the network, uncached.
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "New notification", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "New notification";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/pwa/icons/192.png",
        badge: "/pwa/icons/96.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url: data.url || "/workspace/notifications", category: data.category || null },
        requireInteraction: data.category === "alerts",
      });
      // A dot on the home-screen icon until the app is opened (where supported).
      if (self.navigator && self.navigator.setAppBadge) await self.navigator.setAppBadge().catch(() => {});
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/workspace/notifications";
  // Same-site paths only.
  const target = new URL(raw.startsWith("/") && !raw.startsWith("//") ? raw : "/workspace/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) await w.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser rotated the subscription: get a new one and tell the server (the session cookie rides along).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cfg = await (await fetch("/api/push/config", { credentials: "same-origin" })).json();
        if (!cfg.enabled || !cfg.publicKey) return;
        const pad = "=".repeat((4 - (cfg.publicKey.length % 4)) % 4);
        const raw = atob((cfg.publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await fetch("/api/push/subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      } catch {
        /* the person can turn notifications on again from Notification settings */
      }
    })(),
  );
});

/* Service worker of a company's public WEBSITE: notifications only. It does not cache anything, handle page loads or make the
 * site installable (the installable app lives on the separate app host and uses /sw.js). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "New notification", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "New notification", {
      body: data.body || "",
      icon: "/pwa/icons/192.png",
      badge: "/pwa/icons/96.png",
      tag: data.tag || undefined,
      renotify: false,
      data: { url: data.url || "/", broadcastId: data.broadcastId || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const raw = typeof d.url === "string" && d.url.startsWith("/") && !d.url.startsWith("//") ? d.url : "/";
  const target = new URL(raw, self.location.origin).href;
  event.waitUntil(
    (async () => {
      if (d.broadcastId) {
        fetch("/api/web-push/click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.broadcastId }), keepalive: true }).catch(() => {});
      }
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

// The browser rotated the subscription: subscribe again with the same topics the server had.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cfg = await (await fetch("/api/web-push/config")).json();
        if (!cfg.enabled || !cfg.publicKey) return;
        const pad = "=".repeat((4 - (cfg.publicKey.length % 4)) % 4);
        const raw = atob((cfg.publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await fetch("/api/web-push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), topics: [], source: "/" }) });
      } catch {
        /* the visitor can subscribe again from the bell on the site */
      }
    })(),
  );
});

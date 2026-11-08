"use strict";
const { Notification, session, app } = require("electron");
const store = require("./store.cjs");

/**
 * Native notifications for the signed-in person. Electron has no Web Push service, so the app asks the workspace what's new
 * (`/api/desktop/notifications`) about once a minute with the same session the web app uses, and shows what it finds with the
 * operating system's own notifications. It works while the app is running, including minimised to the tray.
 */
const INTERVAL = 60_000;
const MAX_INDIVIDUAL = 4;

function createNotifier({ getOrigin, getBrand, onUnread, onOpen }) {
  let timer = null;
  let delay = INTERVAL;
  let stopped = true;

  function show(item) {
    if (!Notification.isSupported()) return;
    const brand = getBrand();
    const n = new Notification({ title: item.title || brand.name, body: item.body || "", icon: brand.icon ? brand.icon.image : undefined, silent: false });
    n.on("click", () => onOpen(item.url));
    n.show();
  }

  async function poll() {
    timer = null;
    const origin = getOrigin();
    try {
      const cfg = store.loadConfig();
      const cursor = cfg.notifyCursor || new Date().toISOString();
      const res = await session.defaultSession.fetch(`${origin}/api/desktop/notifications?after=${encodeURIComponent(cursor)}`, { credentials: "include", signal: AbortSignal.timeout(10_000) });
      if (res.status === 401) {
        onUnread(0); // not signed in (yet)
        delay = INTERVAL;
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        const data = await res.json();
        const seen = new Set(cfg.seen);
        const fresh = (data.items || []).filter((it) => !seen.has(it.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        let newest = cursor;
        for (const it of fresh) {
          seen.add(it.id);
          if (it.createdAt > newest) newest = it.createdAt;
        }
        // A burst (the app was closed for a while) becomes a few notifications and one summary.
        fresh.slice(-MAX_INDIVIDUAL).forEach(show);
        if (fresh.length > MAX_INDIVIDUAL) show({ title: getBrand().name, body: `and ${fresh.length - MAX_INDIVIDUAL} more notifications`, url: "/workspace/notifications" });
        store.saveConfig({ notifyCursor: newest === cursor && !cfg.notifyCursor ? cursor : newest, seen: [...seen].slice(-200) });
        onUnread(Number(data.unread) || 0);
        delay = INTERVAL;
      }
    } catch (err) {
      delay = Math.min(delay * 2, 10 * 60_000); // back off while the network is down
      console.error("[notifier]", err.message);
    }
    if (!stopped) timer = setTimeout(poll, delay);
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      store.saveConfig({ notifyCursor: store.loadConfig().notifyCursor || new Date().toISOString() });
      timer = setTimeout(poll, 3000);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    pollNow() {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      void poll();
    },
    /** Another account signed in: don't replay the previous person's notifications. */
    reset() {
      store.saveConfig({ notifyCursor: new Date().toISOString(), seen: [] });
    },
  };
}

module.exports = { createNotifier, appBadge: (n) => { try { app.setBadgeCount(n); } catch { /* not supported here */ } } };

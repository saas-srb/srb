"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { NotifyPanel, SignalItem } from "@/lib/notify/panels";

/**
 * Browser side of the realtime notifications: ONE EventSource per tab (shared by every bell and page that asks), one set of unread
 * counts, and a toast queue. Counts always come from the server (`/api/notifications/summary`); a signal only tells us to recount
 * sooner and gives us something to show. If the stream drops, a slow poll keeps the bell right until it reconnects.
 */
export interface Toast { key: string; panel: NotifyPanel; item: SignalItem }
interface State { counts: Partial<Record<NotifyPanel, number>>; connected: boolean; toasts: Toast[] }

let state: State = { counts: {}, connected: false, toasts: [] };
const listeners = new Set<() => void>();
const signalListeners = new Set<(panel: NotifyPanel, kind: "new" | "sync", item: SignalItem | null) => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };

let es: EventSource | null = null;
let as: "staff" | "portal" = "staff";
let started = false;
let recountTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const seenToasts = new Set<string>();

async function recount() {
  try {
    const r = await fetch(`/api/notifications/summary${as === "portal" ? "?as=portal" : ""}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = (await r.json()) as { unread?: Partial<Record<NotifyPanel, number>> };
    if (j.unread) set({ counts: j.unread });
  } catch { /* offline: keep what we have */ }
}
const recountSoon = () => { if (recountTimer) return; recountTimer = setTimeout(() => { recountTimer = null; void recount(); }, 250); };

function open() {
  if (es || typeof EventSource === "undefined") return;
  es = new EventSource(`/api/notifications/stream${as === "portal" ? "?as=portal" : ""}`);
  es.onopen = () => { set({ connected: true }); void recount(); };
  es.onerror = () => { set({ connected: false }); };
  es.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data) as { type: string; panel?: NotifyPanel; item?: SignalItem | null };
      if (m.type === "ready") { set({ connected: true }); return; }
      if ((m.type === "new" || m.type === "sync") && m.panel) {
        if (m.type === "new" && m.item && !seenToasts.has(m.item.id)) {
          seenToasts.add(m.item.id);
          if (seenToasts.size > 200) seenToasts.clear();
          const t: Toast = { key: m.item.id, panel: m.panel, item: m.item };
          set({ toasts: [...state.toasts, t].slice(-4) });
          setTimeout(() => dismissToast(t.key), 8000);
        }
        signalListeners.forEach((l) => l(m.panel as NotifyPanel, m.type as "new" | "sync", m.item ?? null));
        recountSoon();
      }
    } catch { /* ignore a malformed frame */ }
  };
}

export function dismissToast(key: string) { set({ toasts: state.toasts.filter((t) => t.key !== key) }); }

function start(actor: "staff" | "portal") {
  if (started) return;
  started = true;
  as = actor;
  open();
  void recount();
  const wake = () => { if (document.visibilityState === "visible") { open(); void recount(); } };
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  // Safety net: recount every minute while the stream is down, every five while it is up.
  pollTimer = setInterval(() => { if (document.visibilityState === "visible" && (!state.connected || Date.now() % 300000 < 60000)) void recount(); }, 60_000);
  void pollTimer;
  // EventSource retries by itself, but a server that ends the stream cleanly (its time limit) closes it for good in some browsers: reopen.
  setInterval(() => { if (es && es.readyState === EventSource.CLOSED) { es = null; open(); } }, 5000);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;
const SERVER_STATE: State = { counts: {}, connected: false, toasts: [] };
const serverSnapshot = (): State => SERVER_STATE; // one stable object: React compares snapshots by identity

/** The live state; mounting this anywhere starts the shared stream. */
export function useNotifyState(actor: "staff" | "portal" = "staff"): State {
  useEffect(() => { start(actor); }, [actor]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Runs `fn` whenever a signal arrives for any of `products` (e.g. a notifications page refreshing its list). */
export function onNotifySignal(panels: NotifyPanel[], fn: (item: SignalItem | null, kind: "new" | "sync") => void): () => void {
  const l = (p: NotifyPanel, kind: "new" | "sync", item: SignalItem | null) => { if (panels.includes(p)) fn(item, kind); };
  signalListeners.add(l);
  return () => { signalListeners.delete(l); };
}

/** Tell the bell a product's unread count (the page just marked things read) without waiting for a round trip. */
export function setLocalUnread(panel: NotifyPanel, n: number) { set({ counts: { ...state.counts, [panel]: Math.max(0, n) } }); }
export function refreshNotifyCounts() { void recount(); }

// ── Which bell shows the toasts: the first one mounted on the page (others stay quiet), and another takes over if it unmounts. ──
let hostId: string | null = null;
const hostListeners = new Set<() => void>();
const hostSubscribe = (l: () => void) => { hostListeners.add(l); return () => { hostListeners.delete(l); }; };
const setHost = (id: string | null) => { hostId = id; hostListeners.forEach((l) => l()); };

export function useToastHost(id: string): boolean {
  const current = useSyncExternalStore(hostSubscribe, () => hostId, () => null);
  useEffect(() => {
    if (current === null) setHost(id);
  }, [id, current]);
  useEffect(() => () => { if (hostId === id) setHost(null); }, [id]);
  return current === id;
}

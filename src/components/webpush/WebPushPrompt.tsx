"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pushSupported, urlBase64ToUint8Array } from "@/lib/pwa/client";

interface Config {
  enabled: boolean;
  publicKey: string | null;
  topics: { key: string; label: string; description: string }[];
  title: string;
  text: string;
  delaySeconds: number;
}

const SNOOZE_KEY = "web-push-snoozed-until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const TOPICS_KEY = "web-push-topics";

/**
 * Notification opt-in for a company's public website (end users): a small bell, and a card that opens after a delay, asking
 * which topics they want. Renders nothing unless the browser supports push, the visitor hasn't blocked notifications and the
 * business has switched website notifications on. On iPhone/iPad Safari a plain website can't receive push, so it stays hidden.
 */
export default function WebPushPrompt() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!pushSupported() || Notification.permission === "denied") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/web-push/config").catch(() => null);
      if (!res?.ok || cancelled) return;
      const c = (await res.json()) as Config;
      if (!c.enabled || !c.publicKey || c.topics.length === 0) return;
      const reg = await navigator.serviceWorker.getRegistration("/").catch(() => undefined);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      if (cancelled) return;
      let saved: string[] = [];
      try {
        saved = JSON.parse(localStorage.getItem(TOPICS_KEY) ?? "[]");
      } catch {
        /* ignore */
      }
      setSelected(saved.length ? saved.filter((k) => c.topics.some((t) => t.key === k)) : c.topics.map((t) => t.key));
      setCfg(c);
      setEndpoint(sub?.endpoint ?? null);
      let snoozed = 0;
      try {
        snoozed = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
      } catch {
        /* ignore */
      }
      if (!sub && snoozed < Date.now()) timer = setTimeout(() => setOpen(true), Math.max(0, c.delaySeconds) * 1000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const snooze = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* ignore */
    }
  }, []);

  if (!cfg) return null;

  const toggle = (key: string) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  async function save(sub: PushSubscription) {
    const res = await fetch("/api/web-push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sub.toJSON(), topics: selected, source: location.pathname }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Couldn't save your choice.");
    try {
      localStorage.setItem(TOPICS_KEY, JSON.stringify(selected));
    } catch {
      /* ignore */
    }
  }

  async function subscribe() {
    if (!cfg?.publicKey) return;
    if (selected.length === 0) return setMsg({ kind: "error", text: "Choose at least one topic." });
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg({ kind: "error", text: perm === "denied" ? "Notifications are blocked in your browser settings for this site." : "No problem — you can turn them on any time." });
        if (perm === "denied") snooze();
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/web-sw.js", { scope: "/", updateViaCache: "none" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) }));
      await save(sub);
      setEndpoint(sub.endpoint);
      setMsg({ kind: "ok", text: "You're subscribed. Thanks!" });
      setTimeout(() => setOpen(false), 1600);
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't turn notifications on." });
    } finally {
      setBusy(false);
    }
  }

  async function update() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error("Subscription not found. Turn notifications on again.");
      if (selected.length === 0) throw new Error("Choose at least one topic, or turn notifications off.");
      await save(sub);
      setMsg({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/web-push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setEndpoint(null);
      setMsg({ kind: "ok", text: "Notifications are off." });
    } finally {
      setBusy(false);
    }
  }

  const subscribed = endpoint !== null;
  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 print:hidden">
      {open ? (
        <div role="dialog" aria-label="Notifications" className="w-80 max-w-full rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{subscribed ? <BellRing className="size-4" /> : <Bell className="size-4" />}</div>
              <div>
                <p className="text-sm font-semibold leading-tight">{subscribed ? "Your notifications" : cfg.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subscribed ? "Choose what you'd like to hear about." : cfg.text}</p>
              </div>
            </div>
            <button type="button" onClick={subscribed ? () => setOpen(false) : snooze} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
          </div>

          <ul className="mt-3 space-y-1.5">
            {cfg.topics.map((t) => (
              <li key={t.key}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                  <input type="checkbox" checked={selected.includes(t.key)} onChange={() => toggle(t.key)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {msg ? <p role="status" className={`mt-2 text-xs ${msg.kind === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>{msg.text}</p> : null}

          <div className="mt-3 flex items-center gap-2">
            {subscribed ? (
              <>
                <Button type="button" size="sm" onClick={() => void update()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" data-icon="inline-start" />} Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void unsubscribe()} disabled={busy}>Turn off</Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" onClick={() => void subscribe()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Bell className="size-4" data-icon="inline-start" />} Allow notifications</Button>
                <Button type="button" size="sm" variant="ghost" onClick={snooze} disabled={busy}>Not now</Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={subscribed ? "Notification settings" : "Get notifications"}
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-primary shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {subscribed ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        </button>
      ) : null}
    </div>
  );
}

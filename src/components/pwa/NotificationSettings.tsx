"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, Check, Loader2, Mail, Moon, Send, Smartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InstallCard } from "@/components/pwa/InstallApp";
import { PUSH_CATEGORIES, PUSH_CATEGORY_META, type PushCategory, type PushPreferences } from "@/lib/push/categories";
import { detectPlatform, isDesktopApp, isStandalone, pushSupported, urlBase64ToUint8Array } from "@/lib/pwa/client";

interface Device {
  id: string;
  device: string;
  createdAt: string;
  lastSuccessAt: string | null;
}

type Status = { kind: "ok" | "error" | "info"; text: string } | null;

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-primary" : "bg-input"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data: data as T } : { ok: false, error: (data as { error?: string }).error ?? "Something went wrong." };
  } catch {
    return { ok: false, error: "You appear to be offline. Try again when you are connected." };
  }
}

export default function NotificationSettings({ initialPreferences, initialDevices }: { initialPreferences: PushPreferences; initialDevices: Device[] }) {
  const [prefs, setPrefs] = useState(initialPreferences);
  const [devices, setDevices] = useState(initialDevices);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);

  const [serverPush, setServerPush] = useState<{ enabled: boolean; publicKey: string | null } | null>(null);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [needsInstall, setNeedsInstall] = useState(false);

  // ---- this device
  const refreshDevice = useCallback(async () => {
    if (!pushSupported()) {
      setSupported(false);
      // iPhone/iPad only allow push from the installed home-screen app.
      setNeedsInstall(detectPlatform() === "ios" && !isStandalone());
      return;
    }
    setPermission(Notification.permission);
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    setEndpoint(sub?.endpoint ?? null);
  }, []);

  useEffect(() => {
    void refreshDevice();
    void api<{ enabled: boolean; publicKey: string | null }>("/api/push/config").then((r) => r.ok && setServerPush(r.data));
  }, [refreshDevice]);

  const reloadDevices = async () => {
    const r = await api<{ devices: Device[] }>("/api/push/devices");
    if (r.ok) setDevices(r.data.devices);
  };

  async function enable() {
    setStatus(null);
    if (!serverPush?.enabled || !serverPush.publicKey) return setStatus({ kind: "error", text: "Push notifications aren't enabled on this server yet. Ask your administrator." });
    setBusy("enable");
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setStatus({ kind: "error", text: perm === "denied" ? "Notifications are blocked for this site. Allow them in your browser or device settings, then try again." : "Permission wasn't granted." });
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(serverPush.publicKey) }));
      const saved = await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
      if (!saved.ok) {
        await sub.unsubscribe().catch(() => {});
        return setStatus({ kind: "error", text: saved.error });
      }
      setEndpoint(sub.endpoint);
      await reloadDevices();
      setStatus({ kind: "ok", text: "Notifications are on for this device." });
    } catch {
      setStatus({ kind: "error", text: "Couldn't turn notifications on in this browser." });
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    setStatus(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe().catch(() => {});
      }
      setEndpoint(null);
      await reloadDevices();
      setStatus({ kind: "info", text: "Notifications are off for this device." });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setStatus(null);
    const r = await api<{ delivered: number }>("/api/push/test", { method: "POST" });
    setStatus(r.ok ? { kind: "ok", text: "Test sent. It should arrive in a moment." } : { kind: "error", text: r.error });
    setBusy(null);
  }

  async function removeDevice(id: string) {
    await api(`/api/push/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reloadDevices();
    void refreshDevice();
  }

  // ---- preferences (saved as they change)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  function update(next: PushPreferences) {
    setPrefs(next);
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await api<{ preferences: PushPreferences }>("/api/push/preferences", { method: "PUT", body: JSON.stringify({ preferences: next }) });
      if (r.ok) setSaving("saved");
      else {
        setSaving("idle");
        setStatus({ kind: "error", text: r.error });
      }
    }, 400);
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const thisDeviceOn = endpoint !== null && permission === "granted";
  const timezones = typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone") : [];
  const browserTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  return (
    <div className="space-y-6">
      {/* ---- this device */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${thisDeviceOn ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{thisDeviceOn ? <BellRing className="size-5" /> : <BellOff className="size-5" />}</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">Push notifications on this device</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {!supported
                ? isDesktopApp()
                  ? "You are using the desktop app, which shows your notifications on this computer while it is running (it can stay in the system tray). Your choices below still apply to your phone and other browsers."
                  : needsInstall
                  ? "On iPhone and iPad, notifications work from the installed app. Add this app to your Home Screen below, open it from there, then come back here."
                  : "This browser doesn't support push notifications. Try Chrome, Edge, Firefox or Safari."
                : permission === "denied"
                  ? "Notifications are blocked for this site. Allow them in your browser or device settings, then reload."
                  : thisDeviceOn
                    ? "This device will get the notifications you choose below, even when the app is closed."
                    : "Turn this on to get business events, reminders and alerts on this device."}
            </p>
            {serverPush && !serverPush.enabled ? <p className="mt-2 text-sm text-destructive">Push isn&apos;t configured on this server yet, so nothing can be delivered. Your administrator needs to set it up.</p> : null}
            {supported ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {thisDeviceOn ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => void disable()} disabled={busy !== null}>
                      {busy === "disable" ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <BellOff className="size-4" data-icon="inline-start" />} Turn off here
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void sendTest()} disabled={busy !== null}>
                      {busy === "test" ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Send className="size-4" data-icon="inline-start" />} Send a test
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" onClick={() => void enable()} disabled={busy !== null || permission === "denied" || serverPush?.enabled === false}>
                    {busy === "enable" ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Bell className="size-4" data-icon="inline-start" />} Turn on notifications
                  </Button>
                )}
              </div>
            ) : null}
            {status ? (
              <p role="status" className={`mt-3 text-sm ${status.kind === "error" ? "text-destructive" : status.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{status.text}</p>
            ) : null}
          </div>
        </div>
      </section>

      <InstallCard />

      {/* ---- what to notify about */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">What to notify me about</h2>
            <p className="text-sm text-muted-foreground">Applies to push notifications on all your devices. The in-app bell always shows everything; email has its own choices below.</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? <span className="inline-flex items-center gap-1"><Check className="size-3.5" /> Saved</span> : ""}</span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">All push notifications</p>
            <p className="text-xs text-muted-foreground">Master switch for every device of yours.</p>
          </div>
          <Toggle checked={prefs.enabled} onChange={(v) => update({ ...prefs, enabled: v })} label="All push notifications" />
        </div>

        <ul className="mt-2 divide-y divide-border">
          {PUSH_CATEGORIES.map((key: PushCategory) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{PUSH_CATEGORY_META[key].label}</p>
                <p className="text-xs text-muted-foreground">{PUSH_CATEGORY_META[key].description}</p>
              </div>
              <Toggle checked={prefs.categories[key]} disabled={!prefs.enabled} onChange={(v) => update({ ...prefs, categories: { ...prefs.categories, [key]: v } })} label={PUSH_CATEGORY_META[key].label} />
            </li>
          ))}
        </ul>
      </section>

      {/* ---- email */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 size-5 text-primary" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Email notifications</h2>
            <p className="text-sm text-muted-foreground">The same events can also reach your inbox. Pick which. Sign-in codes, invoices and invitations are not notifications and always arrive.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">All notification emails</p>
            <p className="text-xs text-muted-foreground">Master switch. To keep your inbox calm, at most a few emails an hour are sent, and a repeated reminder is sent once.</p>
          </div>
          <Toggle checked={prefs.email.enabled} onChange={(v) => update({ ...prefs, email: { ...prefs.email, enabled: v } })} label="All notification emails" />
        </div>
        <ul className="mt-2 divide-y divide-border">
          {PUSH_CATEGORIES.map((key: PushCategory) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{PUSH_CATEGORY_META[key].label}</p>
                <p className="text-xs text-muted-foreground">{PUSH_CATEGORY_META[key].description}</p>
              </div>
              <Toggle checked={prefs.email.categories[key]} disabled={!prefs.email.enabled} onChange={(v) => update({ ...prefs, email: { ...prefs.email, categories: { ...prefs.email.categories, [key]: v } } })} label={`Email: ${PUSH_CATEGORY_META[key].label}`} />
            </li>
          ))}
        </ul>
      </section>

      {/* ---- quiet hours */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Moon className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Quiet hours</h2>
              <p className="text-sm text-muted-foreground">No push during these hours, except alerts. Everything is still in your in-app bell.</p>
            </div>
          </div>
          <Toggle checked={prefs.quietHours.enabled} disabled={!prefs.enabled} onChange={(v) => update({ ...prefs, quietHours: { ...prefs.quietHours, enabled: v, timezone: prefs.quietHours.timezone === "UTC" ? browserTz : prefs.quietHours.timezone } })} label="Quiet hours" />
        </div>
        {prefs.quietHours.enabled ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">From</span>
              <Input type="time" value={prefs.quietHours.start} onChange={(e) => e.target.value && update({ ...prefs, quietHours: { ...prefs.quietHours, start: e.target.value } })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Until</span>
              <Input type="time" value={prefs.quietHours.end} onChange={(e) => e.target.value && update({ ...prefs, quietHours: { ...prefs.quietHours, end: e.target.value } })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Time zone</span>
              <select
                value={prefs.quietHours.timezone}
                onChange={(e) => update({ ...prefs, quietHours: { ...prefs.quietHours, timezone: e.target.value } })}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {(timezones.includes(prefs.quietHours.timezone) ? timezones : [prefs.quietHours.timezone, ...timezones]).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      {/* ---- devices */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Your devices</h2>
        <p className="text-sm text-muted-foreground">Browsers and apps that receive your push notifications.</p>
        {devices.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No devices yet. Turn notifications on from a device above.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{d.device}</p>
                  <p className="text-xs text-muted-foreground" suppressHydrationWarning>Added {new Date(d.createdAt).toLocaleDateString()}{d.lastSuccessAt ? ` · last delivered ${new Date(d.lastSuccessAt).toLocaleDateString()}` : ""}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => void removeDevice(d.id)} aria-label={`Remove ${d.device}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

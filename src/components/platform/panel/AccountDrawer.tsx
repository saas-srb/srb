"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { CheckCircle2, LogOut, Monitor, MonitorSmartphone, Moon, ShieldAlert, ShieldCheck, Sun, UserCog, X, XCircle } from "lucide-react";
import NotificationSettings from "@/components/pwa/NotificationSettings";
import TwoStepSettings, { TWO_STEP_DESCRIPTION } from "@/components/security/TwoStepSettings";
import SessionsList from "@/app/(products)/commandos/(protected)/settings/security/SessionsList";
import type { HistoryView, SessionView } from "@/lib/security/sessions";
import type { PushPreferences } from "@/lib/push/categories";
import { cn, formatDateTime } from "@/lib/utils";

export type AccountView = "profile" | "sessions";

interface Device {
  id: string;
  device: string;
  createdAt: string;
  lastSuccessAt: string | null;
}

export interface AccountDrawerProps {
  open: boolean;
  view: AccountView;
  onViewChange: (view: AccountView) => void;
  onClose: () => void;
  email: string;
  displayName: string;
  initials: string;
  roleLabel: string;
  roles: string[];
  createdAt?: string;
  lastLoginAt?: string | null;
  /** Where this account's own profile lives when the signed-in person has no Workspace account (e.g. the Client Portal). */
  fallbackHref: string;
}

const TABS: { key: AccountView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "profile", label: "Profile & Settings", icon: UserCog },
  { key: "sessions", label: "Sessions & Devices", icon: MonitorSmartphone },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Avoids a next-themes server/client mismatch, same as the public header's toggle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const options = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {options.map(({ key, label, icon: Icon }) => {
        const active = mounted && (theme ?? "system") === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(key)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors",
              active ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function NotificationsPanel() {
  const [data, setData] = useState<{ preferences: PushPreferences; devices: Device[] } | "unavailable" | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/push/preferences", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/push/devices", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([p, d]) => live && setData({ preferences: p.preferences, devices: d.devices }))
      .catch(() => live && setData("unavailable"));
    return () => {
      live = false;
    };
  }, []);
  if (data === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (data === "unavailable") return <p className="text-xs text-muted-foreground">Notification settings aren&apos;t available for this account.</p>;
  return <NotificationSettings initialPreferences={data.preferences} initialDevices={data.devices} />;
}

function ProfileView(p: AccountDrawerProps) {
  return (
    <div className="space-y-4">
      <Section title="Profile">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary ring-2 ring-primary/20">{p.initials}</span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-foreground">{p.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{p.email}</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <ShieldCheck className="size-3" /> {p.roleLabel}
            </span>
          </div>
        </div>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <dt className="text-muted-foreground">Assigned roles</dt>
            <dd className="text-right font-semibold text-foreground">{p.roles.join(", ") || "—"}</dd>
          </div>
          {p.createdAt && (
            <div className="flex justify-between gap-3 border-b border-border/40 pb-2">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-semibold text-foreground">{formatDateTime(p.createdAt)}</dd>
            </div>
          )}
          {p.lastLoginAt && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd className="font-semibold text-foreground">{formatDateTime(p.lastLoginAt)}</dd>
            </div>
          )}
        </dl>
      </Section>

      <Section title="Two-step sign-in" description={TWO_STEP_DESCRIPTION}>
        <TwoStepSettings />
      </Section>

      <Section title="Appearance" description="Light or dark theme for this device.">
        <ThemeChoice />
      </Section>

      <Section title="Notifications" description="Choose what reaches your phone or computer, and when.">
        <NotificationsPanel />
      </Section>
    </div>
  );
}

function SessionsView({ fallbackHref, onClose }: { fallbackHref: string; onClose: () => void }) {
  const [data, setData] = useState<{ sessions: SessionView[]; history: HistoryView[] } | "unavailable" | null>(null);
  const load = useCallback(() => {
    fetch("/api/account/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => setData("unavailable"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (data === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (data === "unavailable") {
    return (
      <p className="text-xs text-muted-foreground">
        Device sessions aren&apos;t tracked for this account.{" "}
        <Link href={fallbackHref} onClick={onClose} className="font-semibold text-primary underline-offset-2 hover:underline">
          Open your account
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <Section title="Where you're signed in" description="Every device signed in to your account right now. Log out any you don't recognise.">
        <SessionsList sessions={data.sessions} onChange={load} />
      </Section>
      <Section title="Sign-in history" description="The last sign-ins, failed attempts and sign-outs, kept for 180 days.">
        {data.history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-border/50" aria-label="Sign-in history">
            {data.history.map((e) => {
              const Icon = e.tone === "good" ? CheckCircle2 : e.tone === "bad" ? XCircle : e.type === "logout" ? LogOut : ShieldAlert;
              return (
                <li key={e.id} className="flex items-start gap-3 py-2.5">
                  <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", e.tone === "good" ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : e.tone === "bad" ? "bg-destructive/12 text-destructive" : e.tone === "warn" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{e.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {e.deviceLabel} · <span aria-hidden>{e.flag}</span> {e.place}
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={e.at} suppressHydrationWarning>
                    {formatDateTime(e.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}

/** The signed-in person's account, in a side product over the current page, like the Ask AI drawer: opening it never leaves the product being used. */
export default function AccountDrawer(props: AccountDrawerProps) {
  const { open, view, onViewChange, onClose } = props;
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="account-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[999] bg-black/30 backdrop-blur-[1px]"
            aria-hidden
          />
          <motion.aside
            key="account-drawer"
            role="dialog"
            aria-label="Account"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="fixed inset-y-0 right-0 z-[1000] flex h-full w-full flex-col border-l border-border/80 bg-background/95 shadow-2xl backdrop-blur-2xl sm:w-[440px]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-2 ring-primary/20">{props.initials}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-foreground">{props.displayName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{props.email}</p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div role="tablist" aria-label="Account" className="flex shrink-0 gap-1 border-b border-border/60 px-3 py-2">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  onClick={() => onViewChange(key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                    view === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {view === "profile" ? <ProfileView {...props} /> : <SessionsView fallbackHref={props.fallbackHref} onClose={onClose} />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

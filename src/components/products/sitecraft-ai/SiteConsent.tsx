"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CONSENT_KEY, CONSENT_VERSION, type StoredConsent } from "@/lib/products/sitecraft-ai/consent";

const EVENT = "site-consent-change";

function read(): StoredConsent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    const c = raw ? (JSON.parse(raw) as StoredConsent) : null;
    return c && c.v === CONSENT_VERSION && typeof c.tracking === "boolean" ? c : null;
  } catch {
    return null;
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
/** One string per state so React compares it cheaply: "yes", "no", or "" (not decided). */
const snapshot = () => { const c = read(); return c ? (c.tracking ? "yes" : "no") : ""; };

/**
 * Asks a website's visitors before the company's analytics and advertising tags load, and keeps the answer. Nothing that tracks is loaded
 * (the children are not even rendered) until the visitor accepts; "Reject" and a later withdrawal keep it off. The choice is kept in the
 * browser and recorded once on the server, with the time, as evidence of consent. "Cookie settings" stays on the page so the choice can be
 * changed as easily as it was made.
 */
export default function SiteConsent({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => "pending");
  const choose = useCallback((tracking: boolean) => {
    const value: StoredConsent = { v: CONSENT_VERSION, tracking, at: new Date().toISOString() };
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(value)); } catch { /* storage blocked: the choice lasts until the page closes */ }
    void fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracking, version: CONSENT_VERSION }), keepalive: true }).catch(() => {});
    window.dispatchEvent(new Event(EVENT));
    // Withdrawing consent: scripts already running in this page cannot be unloaded, so reload without them.
    if (!tracking && state === "yes") window.location.reload();
  }, [state]);
  const reopen = useCallback(() => { try { window.localStorage.removeItem(CONSENT_KEY); } catch { /* nothing to clear */ } window.dispatchEvent(new Event(EVENT)); }, []);

  if (state === "pending") return null;
  return (
    <>
      {state === "yes" ? children : null}
      {state === "" ? (
        <div role="dialog" aria-label="Cookies and tracking" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl sm:p-5">
          <p className="text-sm font-semibold">We use cookies to understand how this website is used</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Essential cookies keep the site working. With your permission we also load analytics and advertising tools that set cookies and
            measure visits. You can say no and the site works the same, and you can change your mind at any time from &ldquo;Cookie settings&rdquo;.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => choose(true)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Accept all</button>
            <button type="button" onClick={() => choose(false)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Reject non-essential</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={reopen} className="fixed bottom-3 left-3 z-[90] rounded-full border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur hover:text-foreground">Cookie settings</button>
      )}
    </>
  );
}

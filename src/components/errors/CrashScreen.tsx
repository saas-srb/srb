"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, RefreshCw, RotateCcw } from "lucide-react";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import ArcadeStage from "@/components/game/ArcadeStage";
import { buttonVariants } from "@/components/ui/button";

/**
 * What a person sees when a page or a whole product fails (a server error, a bug, a dropped connection mid-load): the same moving stage as
 * the 404 and offline pages — the company's own logo and name, the lost runner (and a game to play) — with plain words and the ways forward:
 * try again, reload, or go back to the start. Nothing technical is shown except a short reference code the support team can look up.
 *
 * Many of these failures are one-off (a database or network hiccup, a cold start): the screen quietly retries ONCE on its own before it
 * shows itself, so most people never see it at all. Every failure is reported to the server log with its reference code.
 *   scope "page"  — covers the whole viewport (website pages, anything outside a product)
 *   scope "product" — drawn inside the product's content area, so the sidebar and top bar stay and the person can move on
 */
export default function CrashScreen({ error, reset, scope }: { error: Error & { digest?: string }; reset: () => void; scope: "page" | "panel" }) {
  const pathname = usePathname() ?? "/";
  const first = pathname.split("/")[1] ?? "";
  const home = scope === "panel" && first ? `/${first}` : "/";
  // Hidden while the one automatic retry is under way (so a transient failure never flashes this screen).
  const [retrying, setRetrying] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const k = `crash-retry:${window.location.pathname}`;
      const last = Number(sessionStorage.getItem(k) ?? 0);
      return Date.now() - last > 30_000;
    } catch {
      return false;
    }
  });
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  useEffect(() => {
    // Report it (best effort) — the reference code ties this screen to the server's log line.
    try {
      const body = JSON.stringify({ digest: error.digest ?? null, message: String(error.message ?? "").slice(0, 300), path: window.location.pathname });
      if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) void fetch("/api/client-error", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    } catch {
      /* reporting must never throw */
    }
    if (!retrying) return;
    try {
      sessionStorage.setItem(`crash-retry:${window.location.pathname}`, String(Date.now()));
    } catch {
      /* private mode: skip the memory, retry still happens once per mount */
    }
    const t = setTimeout(() => {
      setRetrying(false);
      reset();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per failure
  }, [error]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (retrying) return <div className="fixed inset-0 z-[9999] bg-background" aria-busy="true" />;

  const title = offline ? "You’re offline" : "Something went wrong on our side";
  const body = offline
    ? "Your connection dropped while this page was loading. Check it and try again — nothing you entered has been lost."
    : "This page hit a problem and couldn’t finish loading. Your data is safe. Try again — if it keeps happening, tell your admin or support with the reference below.";

  const stage = (
    <ArcadeStage code="500" chip={offline ? "No connection" : "Something went wrong"} title={title} description={body} gamePage="404">
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => reset()} className={buttonVariants({ size: "lg" })}>
          <RotateCcw className="size-4" data-icon="inline-start" /> Try again
        </button>
        <button type="button" onClick={() => window.location.reload()} className={buttonVariants({ size: "lg", variant: "outline" })}>
          <RefreshCw className="size-4" data-icon="inline-start" /> Reload page
        </button>
        <Link href={home} className={buttonVariants({ size: "lg", variant: "ghost" })}>
          {scope === "panel" ? "Back to dashboard" : "Back to home"} <ArrowRight className="size-4" data-icon="inline-end" />
        </Link>
      </div>
      {error.digest ? <p className="mt-4 text-center text-xs text-muted-foreground">Reference: <span className="font-mono">{error.digest}</span></p> : null}
      <p className="mt-2 text-center text-xs text-muted-foreground">Or play a round while you are here.</p>
    </ArcadeStage>
  );

  if (scope === "panel") {
    return (
      <div className="relative overflow-hidden rounded-3xl px-1 py-6 sm:px-4" role="alert">
        <BrandBackdrop />
        {stage}
      </div>
    );
  }
  return (
    <main className="fixed inset-0 z-[9999] isolate flex overflow-y-auto bg-background px-4 py-4 sm:px-6" role="alert">
      <BrandBackdrop />
      <div className="m-auto w-full">{stage}</div>
    </main>
  );
}

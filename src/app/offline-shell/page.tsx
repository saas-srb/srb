import type { Metadata } from "next";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import BrandSplashMark from "@/components/ui/BrandSplashMark";
import BrandSplashName from "@/components/ui/BrandSplashName";
import RunnerLoader from "@/components/ui/RunnerLoader";
import { buttonVariants } from "@/components/ui/button";

/**
 * What the installed app shows when there is no connection. The service worker (public/sw.js) keeps a copy of this page and of its
 * stylesheet and logo, per site (so each company's app has its own), and serves it when a navigation fails. It is rendered by the
 * company's own layout, so the logo, name, colours and fonts are the company's. The retry works without any script bundle: a tiny
 * inline script reloads on the button and as soon as the browser reports it is back online.
 */
export const metadata: Metadata = { title: "You’re offline", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const RETRY = `(function(){var b=document.getElementById('offline-retry'),s=document.getElementById('offline-status');function go(){if(s)s.textContent='Reconnecting…';location.reload();}if(b)b.addEventListener('click',go);addEventListener('online',go);})();`;

export default function OfflinePage() {
  return (
    <main className="fixed inset-0 z-[9999] isolate flex overflow-y-auto bg-background px-4 py-4 sm:px-6">
      <BrandBackdrop />
      <div className="m-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="app-rise flex items-center gap-4 sm:gap-5">
          <div className="shrink-0"><BrandSplashMark size="sm" /></div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <BrandSplashName className="truncate text-sm font-bold text-muted-foreground" />
              <span className="arcade-chip">No connection</span>
            </div>
            <h1 className="text-balance text-xl font-black leading-tight tracking-tight text-foreground sm:text-3xl">You’re offline</h1>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">This app needs an internet connection. Check your connection and try again. Nothing you entered has been lost on the server.</p>
          </div>
        </div>
        {/* The game needs scripts and a network, neither of which an offline page has: the same wide stage, with the lost runner. */}
        <div className="app-rise game-hero flex items-center justify-center py-3" style={{ animationDelay: "120ms", maxHeight: "calc(100vh - 340px)", minHeight: "9rem" }}>
          <RunnerLoader scene="lost" sign="OFFLINE" width="min(100%, 22rem)" />
        </div>
        <div className="app-rise arcade-message flex flex-col items-center gap-2" style={{ animationDelay: "240ms" }}>
          <button id="offline-retry" type="button" className={buttonVariants({ size: "lg" })}>
            Try again
          </button>
          <p id="offline-status" className="text-xs text-muted-foreground" aria-live="polite">We’ll reconnect automatically when you’re back online.</p>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: RETRY }} />
    </main>
  );
}

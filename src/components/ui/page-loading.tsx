import BrandSplashMark from "@/components/ui/BrandSplashMark";
import BrandSplashName from "@/components/ui/BrandSplashName";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import LoadingStatus from "@/components/ui/LoadingStatus";
import RunnerLoader from "@/components/ui/RunnerLoader";
import BrandMark from "@/components/BrandMark";
import SnapshotShell from "@/components/ui/SnapshotShell";

const PAGE_STEPS = ["Fetching your data", "Putting the page together", "Polishing the details", "Nearly there"];

/**
 * Shown the instant a product page is requested, inside the product's shell (sidebar and top bar stay, so a click answers immediately): a
 * compact version of the opening screen — the company's mark, the cartoon runner and a moving status line — centred in the content
 * area. Theme tokens and the company's own brand only. Server component, no data access.
 */
export function PageLoading() {
  return (
    <div className="relative flex min-h-[55vh] flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <BrandBackdrop />
      <BrandSplashMark size="md" />
      <RunnerLoader width="19rem" />
      <LoadingStatus steps={PAGE_STEPS} />
    </div>
  );
}

/**
 * Shown before a product's shell exists (first load, the installed app opening): the company's own brand on a moving stage. Its logo (or
 * monogram) on a tilt-able glass tile with a ring and orbiting lights, its name, a cartoon runner hopping a crate, and a status line
 * that moves on. Everything — logo, name, colours — comes from the company of the host (the theme and `BrandProvider`); on a host with
 * no company it is neutral. Respects reduced motion. Server component, no data access.
 */
function AppSplash() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-hidden bg-background px-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <BrandBackdrop />
      <BrandSplashMark />
      <BrandSplashName className="app-rise text-center text-2xl font-black tracking-tight" />
      <div className="app-rise" style={{ animationDelay: "260ms" }}>
        <RunnerLoader />
      </div>
      <div className="app-rise" style={{ animationDelay: "380ms" }}>
        <LoadingStatus />
      </div>
    </div>
  );
}

/**
 * What a product shows while it opens AFTER the app has already been on screen (workspace to another product and back): the product's frame —
 * the company's own sidebar (logo, name, menu rows) and header — stays, and only the content area shows the loader. The frame is drawn with
 * the same surfaces and spacing as the real products, so when the real page arrives it simply fills in. Company brand and theme only.
 */
function ShellLoading() {
  return (
    <div className="lms-shell fixed inset-0 z-50 flex gap-3 overflow-hidden bg-canvas p-3" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <aside className="lms-surface hidden w-[248px] shrink-0 flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/95 backdrop-blur-md md:flex dark:bg-card/85">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
          <BrandMark className="size-6 shrink-0" />
          <BrandSplashName className="truncate text-sm font-bold" />
        </div>
        <div className="flex-1 space-y-1 overflow-hidden p-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <div className="skeleton-shine size-5 shrink-0 rounded-md bg-muted/70" style={{ animationDelay: `${i * 80}ms` }} />
              <div className="skeleton-shine h-3 rounded-md bg-muted/70" style={{ width: `${55 + ((i * 17) % 35)}%`, animationDelay: `${i * 80 + 50}ms` }} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border/60 p-3">
          <div className="skeleton-shine size-9 shrink-0 rounded-full bg-muted/70" />
          <div className="flex-1 space-y-1.5"><div className="skeleton-shine h-3 w-24 rounded-md bg-muted/70" /><div className="skeleton-shine h-2.5 w-16 rounded-md bg-muted/70" /></div>
        </div>
      </aside>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="lms-surface flex h-14 shrink-0 items-center gap-3 rounded-3xl border border-border/40 bg-background/95 px-4 backdrop-blur-md dark:bg-card/85">
          <BrandMark className="size-6 shrink-0 md:hidden" />
          <div className="space-y-1.5"><div className="skeleton-shine h-3.5 w-36 rounded-md bg-muted/70" /><div className="skeleton-shine h-2.5 w-52 max-w-[40vw] rounded-md bg-muted/70" /></div>
          <div className="skeleton-shine mx-auto hidden h-9 w-full max-w-sm rounded-full bg-muted/70 md:block" />
          <div className="ml-auto flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton-shine size-9 rounded-full bg-muted/70" style={{ animationDelay: `${i * 70}ms` }} />)}</div>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden rounded-2xl">
          <PageLoading />
        </main>
      </div>
    </div>
  );
}

/**
 * The product-opening loader (every product's top-level `loading.tsx`): the full splash the first time, the product's frame (sidebar and header)
 * afterwards. Both are in the markup and plain CSS shows one of them, by the `data-app-shell-seen` attribute that `NavigationProgress` puts on
 * <html> once the app has been on screen in this tab (it is gone again on a full reload). No script decides during render, so the server's
 * HTML and the client always agree.
 */
export function AppLoading() {
  return (
    <>
      <div className="app-splash-wrap"><AppSplash /></div>
      <div className="app-shell-wrap"><SnapshotShell fallback={<ShellLoading />} loader={<PageLoading />} /></div>
    </>
  );
}

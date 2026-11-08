import type { ReactNode } from "react";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import ArcadeStage from "@/components/game/ArcadeStage";

/**
 * Full-page (viewport-covering) shell for the "nothing here" screens (404, no workspace): the same moving stage as the loading
 * screen. The company's own logo and name (nothing at all on a host no company owns), a cartoon runner who has lost its way beside
 * a leaning signpost, then a card with the message and its actions. Server component, no data access; only theme tokens, so it takes
 * the colours of whichever site or company it is shown on.
 */
export default function ErrorScreen({
  code,
  title,
  children,
  actions,
  footer,
  gamePage = "404",
}: {
  code: string;
  /** Which page the mini-game is on (kept with each saved score). */
  gamePage?: "404" | "no-workspace";
  /** Kept for callers; the stage replaces the icon tile. */
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    // Fixed over the whole viewport: a 404 raised inside a site layout must not show that layout's header, footer or floating buttons.
    <main className="fixed inset-0 z-[9999] isolate flex overflow-y-auto bg-background px-4 py-4 sm:px-6">
      <BrandBackdrop />
      <div className="m-auto w-full">
        <ArcadeStage code={code} chip={code === "404" ? "Page not found" : code} title={title} description={children} gamePage={gamePage}>
          {actions ? <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">{actions}</div> : null}
          {footer ? <div className={`text-sm text-muted-foreground ${actions ? "mt-4" : ""}`}>{footer}</div> : null}
        </ArcadeStage>
      </div>
    </main>
  );
}

import type { ReactNode } from "react";
import BrandSplashMark from "@/components/ui/BrandSplashMark";
import BrandSplashName from "@/components/ui/BrandSplashName";
import RunnerGame from "@/components/game/RunnerGame";

/**
 * The layout of the "nothing here / back soon" pages: the company's own brand at the top (its logo and name, theme colours), the game as
 * the full-width centrepiece, and the message underneath. One continuous column instead of separate blocks. Server component; the brand and
 * the game read the company of the host they are shown on.
 */
export default function ArcadeStage({ code, chip, title, description, gamePage, children }: { code: string; chip: string; title: string; description: ReactNode; gamePage: "404" | "no-workspace" | "maintenance"; children?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="app-rise flex items-center gap-4 sm:gap-5">
        <div className="shrink-0"><BrandSplashMark size="sm" /></div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <BrandSplashName className="truncate text-sm font-bold text-muted-foreground" />
            <span className="arcade-chip">{chip}</span>
          </div>
          <h1 className="text-balance text-xl font-black leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
          <div className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{description}</div>
        </div>
      </div>
      <div className="app-rise" style={{ animationDelay: "120ms" }}>
        <RunnerGame page={gamePage} code={code} />
      </div>
      {children ? <div className="app-rise arcade-message" style={{ animationDelay: "240ms" }}>{children}</div> : null}
    </div>
  );
}

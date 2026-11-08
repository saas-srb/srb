import { PanelName } from "@/components/platform/PanelsProvider";
import BrandMark from "@/components/BrandMark";
import { brandify } from "@/lib/brand";
import { BrandName } from "@/components/platform/BrandProvider";

/** Shared split-hero shell for /clientos login / register / forgot-password. */
export default function PortalAuthShell({
  headline,
  sub,
  children,
}: {
  headline: React.ReactNode;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lms-shell flex min-h-screen bg-canvas">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-10 lg:flex">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[20%] -left-[10%] h-[60%] w-[60%] rounded-full bg-primary/15 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
          <div className="absolute top-[10%] right-[5%] h-[50%] w-[50%] rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
          <div className="absolute -bottom-[20%] left-[20%] h-[70%] w-[70%] rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-4000" />
          <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-slate-400/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        </div>
        <div className="relative z-10 flex items-center gap-2 text-lg font-bold">
          <BrandMark className="size-7 shrink-0" />
          <BrandName /> <span className="text-foreground"><PanelName panel="portal" fallback="Portal" /></span>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-black tracking-tight text-foreground">{headline}</h1>
          <p className="mt-4 text-muted-foreground">{brandify(sub)}</p>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground">
          Applicants · Interns · Trainees · Clients — one door, four experiences.
        </p>
      </div>
      <div className="flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2">{children}</div>
    </div>
  );
}

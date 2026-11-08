import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { getMaintenanceMode } from "@/lib/products/sitecraft-ai/settings";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";

/**
 * Shown in place of any public page while CMS maintenance mode is on — the
 * proxy rewrites to it (`src/lib/sitecraft-ai/maintenance-gate.ts`). Outside the
 * `(site)` group on purpose: no header/footer/nav links into a site that's
 * currently unavailable. The message is edited at /sitecraft-ai/settings.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { title } = await getMaintenanceMode();
  return { title, robots: { index: false, follow: false } };
}

export default async function MaintenancePage() {
  const [{ message, heading }, { brand }] = await Promise.all([getMaintenanceMode(), getSiteInfo()]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-4 py-2 text-sm font-semibold text-foreground">
          <BrandMark className="size-4" />
          <span>
            {brand.namePrimary}<span className="text-primary">{brand.nameAccent}</span>
          </span>
        </div>
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <Wrench className="size-7 text-primary" />
        </div>
        <h1 className="mb-4 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{heading}</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

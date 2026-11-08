import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, PowerOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getPanelRecord } from "@/lib/platform/panels/store";

/** Shown (403) by the proxy when someone opens a product the platform has switched off for them. */
export const metadata: Metadata = { title: "Product not available", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelUnavailablePage({ searchParams }: { searchParams: Promise<{ panel?: string }> }) {
  const { panel } = await searchParams;
  const record = panel ? await getPanelRecord(panel).catch(() => null) : null;
  // The public website is for visitors, not staff: no Workspace link, no mention of admins.
  if (panel === "website") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10"><PowerOff className="size-7 text-primary" /></div>
          <h1 className="mb-3 text-3xl font-black tracking-tight text-foreground">This site is unavailable</h1>
          <p className="text-base leading-relaxed text-muted-foreground">Please check back later.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <PowerOff className="size-7 text-primary" />
        </div>
        <h1 className="mb-3 text-3xl font-black tracking-tight text-foreground">{record ? `${record.name} isn’t available` : "This product isn’t available"}</h1>
        <p className="mb-6 text-base leading-relaxed text-muted-foreground">It has been switched off for your workspace. If you need it, ask your company admin to contact the platform administrator.</p>
        <Link href="/commandos" className={buttonVariants()}>
          <LayoutGrid className="size-4" data-icon="inline-start" /> Back to Workspace
        </Link>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Lock, LockOpen } from "lucide-react";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { listPanels } from "@/lib/platform/panels/store";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { BILLING_SETTINGS_PATH } from "@/lib/platform/billing/enforce";
import { productAppPath } from "@/lib/platform/saas/product-routes";
import { whiteLabelProductName } from "@/lib/platform/panels/types";

export const metadata: Metadata = { title: "Upgrade to unlock", robots: { index: false, follow: false } };

/**
 * Where a product outside the company's plan sends people (`requireModule()` in
 * each product's layout). Names the product and points at Company → Plan & billing.
 */
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const { module: key } = await searchParams;
  const base = MODULES.find((m) => m.key === key) ?? null;
  // Name and description come from the Product Registry, like everywhere else.
  const reg = (await listPanels()).find((p) => p.key === key);
  const mod = base ? { key: base.key, label: whiteLabelProductName(reg?.name ?? base.label), description: reg?.description ?? base.description } : null;
  const e = await getEntitlements();
  const unlocked = mod !== null && (e.modules === null || e.modules.has(mod.key));
  const label = mod?.label ?? "this product";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          {unlocked ? <LockOpen className="size-7 text-primary" /> : <Lock className="size-7 text-primary" />}
        </div>
        {unlocked ? (
          <>
            <h1 id="upgrade-title" className="mb-3 text-3xl font-black tracking-tight text-foreground">
              {label} is included
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">Your plan includes this product now.</p>
            <Link href={productAppPath(mod!.key)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Open {label}
              <ArrowRight className="size-4" />
            </Link>
          </>
        ) : (
          <>
            <h1 id="upgrade-title" className="mb-3 text-3xl font-black tracking-tight text-foreground">
              Upgrade to unlock {label}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {mod ? `${mod.label} (${mod.description.toLowerCase()}) isn't` : "This product isn't"} included in your {e.planName ? `${e.planName} plan` : "current plan"}. Upgrade your plan to start using it — your
              other products and data are unaffected.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Link id="upgrade-billing-link" href={BILLING_SETTINGS_PATH} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                See plans &amp; upgrade
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/commandos" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <ArrowLeft className="size-4" />
                Back to dashboard
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Only your workspace Director can change the plan.</p>
          </>
        )}
      </div>
    </div>
  );
}

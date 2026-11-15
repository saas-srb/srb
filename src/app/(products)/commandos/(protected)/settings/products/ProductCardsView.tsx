import Link from "next/link";
import { Lock } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PRODUCT_STATUS_LABEL, SLUG_TO_PANEL, type ProductStatus } from "@/lib/products/commandos/product-status";
import { PRODUCT_GROUPS } from "./product-groups";

const PRODUCT_SETTINGS_PATH = "/commandos/settings/products";

/** A card per product with its status and Configure (no data access: the page and the dev harness both use it). `locked` = no access to that product. */
export default function ProductCardsView({ statuses, locked }: { statuses: Record<string, ProductStatus>; locked: Record<string, boolean> }) {
  return (
    <>
        {PRODUCT_GROUPS.map((group) => (
          <section key={group.label} className="space-y-3" aria-label={group.label}>
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.products.map((product) => {
                const Icon = product.icon;
                const panelKey = SLUG_TO_PANEL[product.key];
                const isLocked = Boolean(locked[product.key]);
                const status = statuses[product.key] ?? "ready";
                return (
                  <GlassCard key={product.key} interactive={false} className={cn("h-full", isLocked && "opacity-60 grayscale-[40%]")} data-product={product.key} data-locked={isLocked || undefined}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted", product.color)}><Icon className="size-4" aria-hidden /></span>
                          <CardTitle className="text-sm font-semibold">{product.name}</CardTitle>
                        </div>
                        {isLocked ? (
                          <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="size-3" aria-hidden />No access</Badge>
                        ) : (
                          <Badge variant="outline" className={cn("shrink-0 text-[10px]", status === "ready" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300")}>{PRODUCT_STATUS_LABEL[status]}</Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1 text-xs leading-relaxed">{product.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {isLocked ? (
                        <Link href={`/commandos/locked?item=product.${panelKey}`} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">You don&apos;t have access. Ask your Director</Link>
                      ) : (
                        <Link href={`${PRODUCT_SETTINGS_PATH}?open=${product.key}`} scroll={false} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" aria-label={`Configure ${product.name}`}>Configure</Link>
                      )}
                    </CardContent>
                  </GlassCard>
                );
              })}
            </div>
          </section>
        ))}
    </>
  );
}

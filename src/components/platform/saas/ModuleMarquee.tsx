import Link from "next/link";
import type { IconKey } from "@/lib/platform/saas/content";
import ProductLogo from "@/components/products/ProductLogo";
import { productPath } from "@/lib/platform/saas/product-routes";

/** An endless strip of the platform's products, each one a card with its logo and name that opens the product's page. */
export default function ModuleMarquee({ items }: { items: { key: string; name: string; icon: IconKey }[] }) {
  const row = [...items, ...items];
  return (
    <div className="sr-marquee-wrap py-3" aria-label="Products on the platform" role="list">
      <div className="sr-marquee">
        {row.map((x, i) => (
          <div key={`${x.key}-${i}`} role="listitem" aria-hidden={i >= items.length} className="w-[148px] flex-none">
            <Link
              href={productPath(x.key)}
              tabIndex={i >= items.length ? -1 : undefined}
              aria-label={`${x.name} details`}
              className="group flex h-full flex-col items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-110"><ProductLogo productKey={x.key} size={46} title={x.name} /></span>
              <span className="text-[13px] font-black leading-tight">{x.name.replace(/^SelfRun\s+/i, "")}</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

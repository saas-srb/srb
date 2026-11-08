import { ChevronDown } from "lucide-react";
import type { ProductFaq } from "@/lib/platform/saas/product-faq";

/** The product's questions as an accordion (plain <details>: works without scripts, and the answers stay in the page for search engines and AI readers). */
export default function ProductFaqList({ items }: { items: ProductFaq[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-border/70 rounded-3xl border border-border/60 bg-background shadow-sm">
      {items.map((f, i) => (
        <details key={f.q} className="group px-6 py-1" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-bold [&::-webkit-details-marker]:hidden">
            <span>{f.q}</span>
            <ChevronDown className="h-5 w-5 flex-none text-primary transition-transform group-open:rotate-180" />
          </summary>
          <p className="pb-5 pr-8 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

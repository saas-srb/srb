import Link from "next/link";
import { XCircle, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CATEGORIES } from "@/lib/categories";
import { iconForCategory } from "@/lib/category-icons";
import ExportButton, { type ExportFilterParams } from "@/components/products/dealflow-ai/ExportButton";

export default function QuickActions({
  exportParams,
  hasActiveFilters,
  resetHref,
}: {
  exportParams: ExportFilterParams;
  hasActiveFilters: boolean;
  resetHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ExportButton params={exportParams} label="Export current view" />
      {CATEGORIES.map((c) => {
        const Icon = iconForCategory(c.slug);
        return (
          <Link key={c.slug} href={`/dealflow-ai/submissions/${c.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Icon className="size-3.5" data-icon="inline-start" />
            {c.label}
            <ArrowRight className="size-3 opacity-50" />
          </Link>
        );
      })}
      {hasActiveFilters && (
        <Link href={resetHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <XCircle className="size-3.5" data-icon="inline-start" />
          Clear all filters
        </Link>
      )}
    </div>
  );
}

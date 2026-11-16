import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export const COMPANY_SETUP_HREF = "/commandos/onboarding";

/**
 * The company's identity inside a product's settings: read-only, with the way to change it. A product never keeps its own copy of who the
 * company is: it is managed once in CommandOS, Organization Setup, Company setup, and every product reads it from there.
 */
export default function IdentitySummary({ title = "Company identity", rows, note }: { title?: string; rows: { label: string; value: string | null | undefined }[]; note?: string }) {
  const shown = rows.filter((r) => r.value && String(r.value).trim());
  return (
    <section aria-label={title} data-identity-summary className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{note ?? "Set once for the whole company and used by every product."}</p>
        </div>
        <Link href={COMPANY_SETUP_HREF} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted">
          Manage in CommandOS <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing filled in yet. Add your company details in Company setup.</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {shown.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="break-words font-medium text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

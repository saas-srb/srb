import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import StatusBadge from "@/components/products/dealflow-ai/StatusBadge";
import { getCategoryLabel, type CategorySlug } from "@/lib/categories";
import { formatDateTime } from "@/lib/utils";
import type { SerializedLead } from "@/components/products/dealflow-ai/types";

const STALE_DAYS = 3;

export default function PendingTasksWidget({ count, leads }: { count: number; leads: SerializedLead[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Leads still <span className="font-medium text-foreground">New</span> or{" "}
        <span className="font-medium text-foreground">In Progress</span> for {STALE_DAYS}+ days — respects your active
        filters, ignores the date range.
      </p>
      {leads.length === 0 ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          Nothing pending — every open lead is within the {STALE_DAYS}-day window.
        </p>
      ) : (
        leads.map((lead) => (
          <Link
            key={lead._id}
            href={`/dealflow-ai/submissions/${lead.category}/${lead._id}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <AlertTriangle className="size-3.5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-medium">{lead.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {getCategoryLabel(lead.category as CategorySlug)} · {formatDateTime(lead.createdAt)}
                </p>
              </div>
            </div>
            <StatusBadge status={lead.status} />
          </Link>
        ))
      )}
      {count > leads.length && <p className="text-xs text-muted-foreground">+{count - leads.length} more pending</p>}
    </div>
  );
}
